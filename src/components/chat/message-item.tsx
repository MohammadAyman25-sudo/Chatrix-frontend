import { memo, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  CornerUpLeft,
  Forward,
  Info,
  Loader2,
  Pencil,
} from 'lucide-react'
import { cn } from 'cn'
import type { Attachment, ChatMessage, MessageReply } from '@/types/api'
import { attachmentLabel } from '@/lib/attachments'
import { textDirection } from '@/lib/direction'
import { EDIT_WINDOW_MS, isEditableMessage, withinEditWindow } from '@/lib/messages'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageAttachments } from '@/components/chat/message-attachments'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function replyPreview(reply: MessageReply): string {
  const text = reply.content?.trim()
  if (text) return text
  const first = reply.attachments[0]
  if (first) return attachmentLabel(first.type, reply.attachments.length)
  return 'Message'
}

function StatusTicks({ message }: { message: ChatMessage }) {
  if (message.pending)
    return <Clock className="h-3.5 w-3.5 opacity-70" aria-label="Sending" />
  if (message.status === 'read')
    return (
      <CheckCheck className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" aria-label="Read" />
    )
  if (message.status === 'delivered')
    return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Delivered" />
  return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
}

export type MessageItemProps = {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  showAvatar: boolean
  highlighted?: boolean
  onOpenAttachment: (attachments: Attachment[], index: number) => void
  onReply?: (message: ChatMessage) => void
  onForward?: (message: ChatMessage) => void
  /** Open the delivery/read "Message info" screen. Own messages only (sender-scoped endpoint). */
  onOpenInfo?: (message: ChatMessage) => void
  onRetry?: (message: ChatMessage) => void
  onJumpToMessage?: (messageId: string) => void
  /** Ask the parent to open this message's inline editor. Only offered while editable. */
  onStartEdit?: (message: ChatMessage) => void
  /** True while this message's inline editor is open (owned by the parent). */
  editing?: boolean
  onCancelEdit?: () => void
  /** Persists the new content; rejects on failure so the editor stays open. */
  onSubmitEdit?: (message: ChatMessage, content: string) => Promise<void>
}

export const MessageItem = memo(function MessageItem({
  message,
  isOwn,
  showSender,
  showAvatar,
  highlighted,
  onOpenAttachment,
  onReply,
  onForward,
  onOpenInfo,
  onRetry,
  onJumpToMessage,
  onStartEdit,
  editing = false,
  onCancelEdit,
  onSubmitEdit,
}: MessageItemProps) {
  const text = message.content
  const attachments = message.attachments
  const senderName = message.sender.displayName || message.sender.username
  const hasAttachments = attachments.length > 0
  const reply = message.replyTo
  // Quoted text rendered in the reply card; direction comes from its first letter.
  const preview = reply ? replyPreview(reply) : ''

  const rowRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const gesture = useRef({ startX: 0, startY: 0, tracking: false, active: false, dx: 0 })
  const [swiping, setSwiping] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  // Flips once the 15-minute edit window closes so the control disappears live.
  const [windowClosed, setWindowClosed] = useState(() => !withinEditWindow(message.createdAt))

  const canEdit = Boolean(onStartEdit) && !windowClosed && isEditableMessage(message, isOwn)

  useEffect(() => {
    if (windowClosed) return
    const deadline = new Date(message.createdAt).getTime() + EDIT_WINDOW_MS
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      setWindowClosed(true)
      return
    }
    const timer = window.setTimeout(() => setWindowClosed(true), remaining + 1000)
    return () => window.clearTimeout(timer)
  }, [windowClosed, message.createdAt])

  // Prime the editor from the current text and put the caret at the end.
  useEffect(() => {
    if (!editing) return
    setDraft(message.content)
    const el = editRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editing, message.content])

  const handleSave = async () => {
    const content = draft.trim()
    if (!content || saving || !onSubmitEdit) return
    if (content === message.content) {
      onCancelEdit?.()
      return
    }
    setSaving(true)
    try {
      await onSubmitEdit(message, content)
    } catch {
      // The parent surfaces the failure; keep the editor open so the draft survives.
    } finally {
      setSaving(false)
    }
  }

  const resetSwipe = () => {
    if (rowRef.current) rowRef.current.style.transform = ''
    if (hintRef.current) hintRef.current.style.opacity = ''
    gesture.current = { startX: 0, startY: 0, tracking: false, active: false, dx: 0 }
    setSwiping(false)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onReply || message.pending) return
    if (event.pointerType === 'mouse') return
    const target = event.target as HTMLElement
    if (target.closest('audio, video, a, button, input, textarea, [data-no-swipe]')) return
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      tracking: true,
      active: false,
      dx: 0,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = gesture.current
    if (!state.tracking) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY

    if (!state.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return
      // Only a rightward swipe is used to quote, matching common chat apps.
      if (dx < 0) {
        state.tracking = false
        return
      }
      state.active = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is a best-effort enhancement.
      }
      setSwiping(true)
    }

    const clamped = Math.max(0, Math.min(80, dx))
    state.dx = clamped
    if (rowRef.current) rowRef.current.style.transform = `translateX(${clamped}px)`
    if (hintRef.current) {
      const reveal = Math.min(1, clamped / 56)
      hintRef.current.style.opacity = String(reveal)
    }
  }

  const handlePointerUp = () => {
    const state = gesture.current
    if (!state.tracking) return
    const shouldReply = state.active && state.dx > 56
    resetSwipe()
    if (shouldReply) onReply?.(message)
  }

  return (
    <div
      ref={rowRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetSwipe}
      style={{ touchAction: 'pan-y' }}
      className={cn('group relative flex w-full gap-2', isOwn ? 'justify-end' : 'justify-start')}
    >
      {swiping && (
        <div
          ref={hintRef}
          className={cn(
            'pointer-events-none absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground',
            isOwn ? 'left-0' : 'left-10',
          )}
          style={{ opacity: 0 }}
          aria-hidden="true"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </div>
      )}

      {!isOwn && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={message.sender.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">{initials(senderName)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div
        className={cn(
          'flex max-w-[min(85%,34rem)] flex-col',
          isOwn ? 'items-end' : 'items-start',
          highlighted && 'chat-flash rounded-xl',
        )}
      >
        {showSender && !isOwn && (
          <span className="mb-1 px-1 text-xs font-medium text-muted-foreground">
            {senderName}
          </span>
        )}

        <div className={cn('flex flex-col gap-1.5', isOwn ? 'items-end' : 'items-start')}>
          {message.forwarded && (
            <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-muted-foreground">
              <Forward className="h-3 w-3" aria-hidden="true" /> Forwarded
            </span>
          )}
          {reply && (
            <button
              type="button"
              onClick={() => onJumpToMessage?.(reply.id)}
              className="flex max-w-full flex-col gap-0.5 overflow-hidden rounded-lg border border-border border-l-2 border-l-primary bg-muted px-2.5 py-1.5 text-start transition-colors hover:border-primary"
            >
              <span className="text-[11px] font-semibold text-primary">
                {reply.sender.displayName || reply.sender.username}
              </span>
              <span
                dir={textDirection(preview)}
                className="line-clamp-2 max-w-[16rem] text-xs text-muted-foreground"
              >
                {preview}
              </span>
            </button>
          )}

          {hasAttachments && (
            <div
              className={cn(
                'overflow-hidden rounded-2xl',
                !text && (isOwn ? 'rounded-br-md' : 'rounded-bl-md'),
              )}
            >
              <MessageAttachments
                attachments={attachments}
                isOwn={isOwn}
                onOpen={(_, index) => onOpenAttachment(attachments, index)}
              />
            </div>
          )}

          {text && !editing && (
            <div
              dir={textDirection(text)}
              className={cn(
                'rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
                isOwn
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md bg-muted text-foreground',
              )}
            >
              {text}
            </div>
          )}

          {editing && (
            <form
              data-no-swipe
              className="w-full min-w-64 max-w-full"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave()
              }}
            >
              <Textarea
                ref={editRef}
                value={draft}
                dir={textDirection(draft)}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelEdit?.()
                  }
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    void handleSave()
                  }
                }}
                rows={2}
                maxLength={4000}
                aria-label="Edit message"
                className="min-h-16"
              />
              <div className="mt-1 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancelEdit?.()}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || !draft.trim()}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </form>
          )}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground',
            isOwn ? 'flex-row-reverse' : '',
          )}
        >
          {message.failed ? (
            <>
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Not sent
              </span>
              {onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(message)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              )}
            </>
          ) : (
            <>
              <span>{formatTime(message.createdAt)}</span>
              {isOwn && <StatusTicks message={message} />}
              {message.editedAt && (
                <span className="italic" title={`Edited ${formatDateTime(message.editedAt)}`}>
                  Edited
                </span>
              )}
              {!editing && onStartEdit && canEdit && (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => onStartEdit(message)}
                    aria-label="Edit message"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              {!editing && onReply && (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => onReply(message)}
                    aria-label="Reply to message"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <CornerUpLeft className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Reply</TooltipContent>
                </Tooltip>
              )}
              {!editing && onForward && (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => onForward(message)}
                    aria-label="Forward message"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Forward className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Forward</TooltipContent>
                </Tooltip>
              )}
              {!editing && isOwn && !message.pending && onOpenInfo && (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => onOpenInfo(message)}
                    aria-label="Message info"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Message info</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})
