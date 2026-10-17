import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import {
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mic,
  Paperclip,
  RotateCw,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { cn } from 'cn'
import type { Attachment, ChatMessage, MessageType } from '@/types/api'
import { apiErrorMessage } from '@/lib/errors'
import {
  attachmentLabel,
  createPendingAttachment,
  formatBytes,
  formatDuration,
  MAX_ATTACHMENTS_PER_UPLOAD,
  MAX_ATTACHMENT_BYTES,
  revokePendingAttachment,
  type PendingAttachment,
} from '@/lib/attachments'
import { uploadMessageAttachment } from '@/lib/uploads'
import { isRecordingSupported, startRecording, type ActiveRecorder } from '@/lib/voice-recorder'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmojiPicker } from '@/components/chat/emoji-picker'

const ACCEPT = {
  photo: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document:
    '.pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx,.ppt,.pptx,.zip,.json,application/*',
} as const

export type ComposerSendInput = {
  content: string
  type: MessageType
  attachments: Attachment[]
  replyToId?: string
  /** Deliver the reply as a DM to the quoted message's author (`replyPrivately`). */
  replyPrivately?: boolean
}

export type ComposerHandle = {
  addFiles: (files: File[]) => void
  focus: () => void
}

export type ComposerProps = {
  conversationId: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  /**
   * Offer the "reply privately" option while composing a reply. Only true in
   * groups when the quoted message is someone else's (see `canReplyPrivately`).
   */
  canReplyPrivately?: boolean
  onSend: (input: ComposerSendInput) => Promise<unknown>
  onTyping?: (isTyping: boolean) => void
  onRecordingChange?: (isRecording: boolean, conversationId: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  ref?: Ref<ComposerHandle>
}

function AttachmentKindIcon({ type, className }: { type: Attachment['type']; className?: string }) {
  if (type === 'image') return <ImageIcon className={className} />
  if (type === 'video') return <Video className={className} />
  if (type === 'audio') return <Mic className={className} />
  return <FileText className={className} />
}

function ReplyPreviewText({ message }: { message: ChatMessage }) {
  const text = message.content.trim()
  if (text) return <>{text}</>
  const first = message.attachments[0]
  if (first) return <>{attachmentLabel(first.type, message.attachments.length)}</>
  return <>Message</>
}

function PendingAttachmentChip({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: PendingAttachment
  onRemove: () => void
  onRetry: () => void
}) {
  const failed = attachment.status === 'error'
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border py-1.5 pl-2 pr-1.5',
        failed ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/50',
      )}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
        {attachment.previewUrl ? (
          <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <AttachmentKindIcon
            type={attachment.type}
            className="h-3.5 w-3.5 text-muted-foreground"
          />
        )}
        {attachment.status === 'uploading' && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block max-w-40 truncate text-xs font-medium">{attachment.name}</span>
        <span className="block text-[11px] text-muted-foreground">
          {attachment.duration != null
            ? formatDuration(attachment.duration)
            : formatBytes(attachment.size)}
        </span>
      </span>
      {failed && (
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Retry upload of ${attachment.name}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function Composer({
  conversationId,
  replyTo,
  onCancelReply,
  canReplyPrivately,
  onSend,
  onTyping,
  onRecordingChange,
  onError,
  disabled,
  ref,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  // Which quoted message the "reply privately" toggle is armed for. Keyed by id
  // so switching/cancelling the reply disarms it without an effect.
  const [privateReplyFor, setPrivateReplyFor] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingRef = useRef(false)
  const typingTimer = useRef<number | undefined>(undefined)
  const activeConversation = useRef(conversationId)
  const recorderRef = useRef<ActiveRecorder | null>(null)
  const recordingConversation = useRef<string | null>(null)
  const recordingTimer = useRef<number | undefined>(undefined)
  const meterRef = useRef<HTMLSpanElement>(null)

  const recordingSupported = useMemo(() => isRecordingSupported(), [])
  const replyToId = replyTo?.id

  // Keep the latest callback in a ref so `stopTyping` stays stable and the
  // per-conversation reset effect only runs when the conversation changes.
  const onTypingRef = useRef(onTyping)
  useEffect(() => {
    onTypingRef.current = onTyping
  }, [onTyping])

  const stopTyping = useCallback(() => {
    window.clearTimeout(typingTimer.current)
    if (typingRef.current) {
      typingRef.current = false
      onTypingRef.current?.(false)
    }
  }, [])

  // Cancel a reply and disarm the private-reply choice that was tied to it.
  const cancelReply = useCallback(() => {
    setPrivateReplyFor(null)
    onCancelReply()
  }, [onCancelReply])

  const stopRecording = useCallback(
    (send: boolean) => {
      window.clearInterval(recordingTimer.current)
      recordingTimer.current = undefined
      const recorder = recorderRef.current
      const cid = recordingConversation.current
      recorderRef.current = null
      recordingConversation.current = null
      setRecording(false)
      setElapsedMs(0)
      if (!recorder) return null
      onRecordingChange?.(false, cid ?? conversationId)
      if (!send) {
        recorder.cancel()
        return null
      }
      return recorder.stop()
    },
    [onRecordingChange, conversationId],
  )

  // Reset the draft when switching conversations and release the microphone.
  // `stopRecording` is read through a ref so socket/identity churn never wipes
  // the draft; only an actual conversation change does.
  const stopRecordingRef = useRef(stopRecording)
  useEffect(() => {
    stopRecordingRef.current = stopRecording
  }, [stopRecording])

  useEffect(() => {
    activeConversation.current = conversationId
    stopTyping()
    stopRecordingRef.current(false)
    setText('')
    setPrivateReplyFor(null)
    setPending((prev) => {
      for (const item of prev) revokePendingAttachment(item)
      return []
    })
    setAttachError(null)
  }, [conversationId, stopTyping])

  useEffect(() => {
    return () => {
      window.clearTimeout(typingTimer.current)
      window.clearInterval(recordingTimer.current)
      recorderRef.current?.cancel()
    }
  }, [])

  // Each file runs the sign → PUT → confirm flow on its own, so one rejection
  // only fails that chip while the others keep their confirmed attachment.
  const startUpload = useCallback(
    async (items: PendingAttachment[]) => {
      for (const item of items) {
        const cid = conversationId
        try {
          const attachment = await uploadMessageAttachment(cid, item.file, item.duration)
          if (activeConversation.current !== cid) return
          setPending((prev) =>
            prev.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, status: 'ready', attachment, error: undefined }
                : candidate,
            ),
          )
        } catch (error) {
          if (activeConversation.current !== cid) return
          const message = apiErrorMessage(error, 'Upload failed.')
          setPending((prev) =>
            prev.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, status: 'error', error: message }
                : candidate,
            ),
          )
        }
      }
    },
    [conversationId],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0 || disabled) return
      setAttachError(null)
      const accepted: File[] = []
      let error: string | null = null
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          error = `"${file.name}" is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
          continue
        }
        if (accepted.length >= MAX_ATTACHMENTS_PER_UPLOAD) {
          error = `You can attach up to ${MAX_ATTACHMENTS_PER_UPLOAD} files at a time.`
          break
        }
        accepted.push(file)
      }
      if (error) setAttachError(error)
      if (accepted.length === 0) return
      const items = accepted.map((file) => createPendingAttachment(file))
      setPending((prev) => [...prev, ...items])
      void startUpload(items)
    },
    [disabled, startUpload],
  )

  useImperativeHandle(
    ref,
    () => ({
      addFiles: (files) => void addFiles(files),
      focus: () => textareaRef.current?.focus(),
    }),
    [addFiles],
  )

  const retryUpload = useCallback(
    (item: PendingAttachment) => {
      setPending((prev) =>
        prev.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: 'uploading', error: undefined }
            : candidate,
        ),
      )
      void startUpload([{ ...item, status: 'uploading' }])
    },
    [startUpload],
  )

  const removeAttachment = useCallback((id: string) => {
    setPending((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) revokePendingAttachment(target)
      return prev.filter((item) => item.id !== id)
    })
    setAttachError(null)
  }, [])

  const openFileDialog = (accept: string) => {
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept
    input.value = ''
    input.click()
  }

  const updateText = (value: string) => {
    setText(value)
    if (!onTypingRef.current) return
    if (value.trim() && !typingRef.current) {
      typingRef.current = true
      onTypingRef.current(true)
    }
    window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => stopTyping(), 1500)
  }

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    if (!el) {
      updateText(text + emoji)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    updateText(next)
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + emoji.length
      el.setSelectionRange(caret, caret)
    })
  }

  const readyAttachments = pending.filter((item) => item.status === 'ready')
  const hasUploading = pending.some((item) => item.status === 'uploading')
  const hasUploadError = pending.some((item) => item.status === 'error')
  const privateReplyActive = Boolean(
    canReplyPrivately && replyToId && privateReplyFor === replyToId,
  )
  const replyPreviewName = replyTo ? replyTo.sender.displayName || replyTo.sender.username : ''
  const canSend =
    !sending &&
    !recording &&
    !hasUploading &&
    !hasUploadError &&
    (text.trim().length > 0 || readyAttachments.length > 0)

  const handleSend = async () => {
    if (!canSend || disabled) return
    const content = text.trim()
    const attachments = readyAttachments
      .map((item) => item.attachment)
      .filter((attachment): attachment is Attachment => Boolean(attachment))
    setSending(true)
    setAttachError(null)
    stopTyping()
    try {
      await onSend({
        content,
        type: attachments.length > 0 ? attachments[0].type : 'text',
        attachments,
        replyToId,
        replyPrivately: privateReplyActive || undefined,
      })
      setText('')
      setPending((prev) => {
        for (const item of prev) revokePendingAttachment(item)
        return []
      })
      cancelReply()
    } catch (error) {
      onError?.(apiErrorMessage(error, 'Message failed to send.'))
    } finally {
      setSending(false)
    }
  }

  const beginRecording = async () => {
    if (recording || sending || disabled || !recordingSupported) return
    setAttachError(null)
    try {
      const recorder = await startRecording()
      recorderRef.current = recorder
      recordingConversation.current = conversationId
      setRecording(true)
      setElapsedMs(0)
      onRecordingChange?.(true, conversationId)
      recordingTimer.current = window.setInterval(() => {
        const active = recorderRef.current
        if (!active) return
        setElapsedMs(active.elapsed())
        if (meterRef.current) {
          meterRef.current.style.transform = `scaleX(${Math.max(0.06, Math.min(1, active.level()))})`
        }
      }, 120)
    } catch (error) {
      onError?.(apiErrorMessage(error, 'Microphone access was blocked.'))
    }
  }

  const finishRecording = async (send: boolean) => {
    const stopped = stopRecording(send)
    if (!stopped) return
    let recorded
    try {
      recorded = await stopped
    } catch {
      onError?.('Recording could not be processed.')
      return
    }
    if (recorded.duration < 0.5) {
      onError?.('Voice messages must be at least half a second long.')
      return
    }
    const file = new File([recorded.blob], `voice-note.${recorded.extension}`, {
      type: recorded.mimeType,
    })
    setSending(true)
    try {
      // Voice notes run the same direct upload flow with the recorded duration,
      // then go out as a normal audio message.
      const attachment = await uploadMessageAttachment(conversationId, file, recorded.duration)
      await onSend({
        content: '',
        type: 'audio',
        attachments: [attachment],
        replyToId,
        replyPrivately: privateReplyActive || undefined,
      })
      cancelReply()
    } catch (error) {
      onError?.(apiErrorMessage(error, 'Voice message failed to send.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          void addFiles(files)
          e.target.value = ''
        }}
      />

      {replyTo && !recording && (
        <div className="flex items-start gap-2 border-b border-l-2 border-l-primary bg-muted px-3 py-2 sm:px-4">
          <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-primary">
              {privateReplyActive
                ? `Replying privately to ${replyPreviewName}`
                : `Replying to ${replyPreviewName}`}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              <ReplyPreviewText message={replyTo} />
            </div>
            {canReplyPrivately && (
              <button
                type="button"
                onClick={() =>
                  setPrivateReplyFor((current) => (current === replyToId ? null : (replyToId ?? null)))
                }
                aria-pressed={privateReplyActive}
                className={cn(
                  'mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  privateReplyActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
                Reply privately
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={cancelReply}
            aria-label="Cancel reply"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(pending.length > 0 || attachError) && !recording && (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pending.map((attachment) => (
                <PendingAttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => removeAttachment(attachment.id)}
                  onRetry={() => retryUpload(attachment)}
                />
              ))}
            </div>
          )}
          {attachError && <p className="text-xs text-destructive">{attachError}</p>}
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void finishRecording(false)}
            aria-label="Cancel recording"
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-5 w-5" />
          </Button>

          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-destructive">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            <span className="hidden sm:inline">Recording</span>
          </span>

          <span className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              ref={meterRef}
              className="absolute inset-0 origin-left scale-x-0 rounded-full bg-destructive transition-transform duration-150 ease-out"
            />
          </span>

          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {formatDuration(elapsedMs / 1000)}
          </span>

          <Button
            type="button"
            size="icon"
            onClick={() => void finishRecording(true)}
            aria-label="Send voice message"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-1 p-3 sm:gap-2 sm:p-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Attach a file"
                  disabled={disabled}
                />
              }
            >
              <Paperclip className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-44">
              <DropdownMenuItem onClick={() => openFileDialog(ACCEPT.photo)}>
                <ImageIcon className="h-4 w-4" /> Photo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openFileDialog(ACCEPT.video)}>
                <Video className="h-4 w-4" /> Video
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openFileDialog(ACCEPT.audio)}>
                <Mic className="h-4 w-4" /> Audio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openFileDialog(ACCEPT.document)}>
                <FileText className="h-4 w-4" /> Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <EmojiPicker onSelect={insertEmoji} disabled={disabled} />

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => updateText(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (files.length > 0) {
                e.preventDefault()
                void addFiles(files)
              }
            }}
            placeholder={
              privateReplyActive
                ? 'Write a private reply…'
                : replyTo
                  ? 'Write a reply…'
                  : 'Type a message…'
            }
            rows={1}
            className={cn('min-h-10 min-w-0 flex-1 resize-none py-2.5')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {recordingSupported && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void beginRecording()}
                disabled={disabled || sending}
                aria-label="Record voice message"
                title="Record voice message"
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
