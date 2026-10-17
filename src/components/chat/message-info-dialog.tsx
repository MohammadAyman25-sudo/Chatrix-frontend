import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  CheckCheck,
  Clock,
  Info,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { ChatMessage, MessageInfo, MessageInfoEntry, Participant } from '@/types/api'
import { attachmentLabel } from '@/lib/attachments'
import { UserAvatar } from '@/components/chat/user-avatar'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

function displayName(user: Participant): string {
  return user.displayName || user.username
}

function messagePreview(message: ChatMessage): string {
  const text = message.content?.trim()
  if (text) return text
  const first = message.attachments[0]
  if (first) return attachmentLabel(first.type, message.attachments.length)
  return 'Message'
}

/** Absolute, unambiguous timestamp for a receipt entry (`at` may be untracked). */
function formatAt(iso: string | null): string {
  if (!iso) return 'Time unavailable'
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

const STATUS_COPY: Record<MessageInfo['status'], { label: string; Icon: typeof Check }> = {
  sent: { label: 'Sent', Icon: Check },
  delivered: { label: 'Delivered', Icon: CheckCheck },
  read: { label: 'Read', Icon: CheckCheck },
}

function StatusSummary({ status }: { status: MessageInfo['status'] }) {
  const { label, Icon } = STATUS_COPY[status]
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
      <Icon
        className={cn('h-4 w-4', status === 'read' ? 'text-sky-500 dark:text-sky-400' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

function RecipientRow({
  name,
  avatarUrl,
  meta,
  tone,
}: {
  name: string
  avatarUrl: string | null
  meta: string
  tone: 'read' | 'delivered' | 'pending'
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar name={name} avatarUrl={avatarUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {tone === 'pending' && <Clock className="h-3 w-3" aria-hidden="true" />}
          {meta}
        </span>
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  )
}

function entryRows(entries: MessageInfoEntry[], tone: 'read' | 'delivered') {
  return entries.map((entry) => (
    <RecipientRow
      key={entry.user.id}
      name={displayName(entry.user)}
      avatarUrl={entry.user.avatarUrl}
      meta={`${tone === 'read' ? 'Read' : 'Received'} ${formatAt(entry.at)}`}
      tone={tone}
    />
  ))
}

/**
 * "Message info" screen for one of your own messages
 * (`GET /conversations/:id/messages/:messageId/info`). The sender is the only
 * one allowed to call it, so the control is only wired up for own messages.
 */
export function MessageInfoDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: ChatMessage | null
}) {
  const [info, setInfo] = useState<MessageInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const messageId = message?.id
  const conversationId = message?.conversationId

  useEffect(() => {
    if (!open || !messageId || !conversationId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setInfo(null)
    ;(async () => {
      try {
        const res = await api.get<{ info: MessageInfo }>(
          `/conversations/${conversationId}/messages/${messageId}/info`,
          { signal: controller.signal },
        )
        if (!controller.signal.aborted) setInfo(res.data.info)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(apiErrorMessage(err, 'Could not load message info.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [open, messageId, conversationId, reloadKey])

  const retry = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onOpenChange])

  if (!open || !message) return null

  const isEmpty =
    info != null &&
    info.deliveredTo.length === 0 &&
    info.readBy.length === 0 &&
    info.pending.length === 0

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Message info"
        className="w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Message info</h2>
              <p className="truncate text-xs text-muted-foreground">{messagePreview(message)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          )}

          {!loading && !error && info && (
            <>
              <StatusSummary status={info.status} />

              {isEmpty && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No recipients to show yet.
                </p>
              )}

              {info.readBy.length > 0 && (
                <Section title={`Read by (${info.readBy.length})`}>
                  {entryRows(info.readBy, 'read')}
                </Section>
              )}

              {info.deliveredTo.length > 0 && (
                <Section title={`Delivered to (${info.deliveredTo.length})`}>
                  {entryRows(info.deliveredTo, 'delivered')}
                </Section>
              )}

              {info.pending.length > 0 && (
                <Section title={`Pending (${info.pending.length})`}>
                  {info.pending.map((user) => (
                    <RecipientRow
                      key={user.id}
                      name={displayName(user)}
                      avatarUrl={user.avatarUrl}
                      meta="Not delivered yet"
                      tone="pending"
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
