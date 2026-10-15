import { useEffect, useMemo, useState } from 'react'
import { Check, Forward, Loader2, Search, Users, X } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { ChatMessage, Conversation, ForwardResult, UserSummary } from '@/types/api'
import { attachmentLabel } from '@/lib/attachments'
import { conversationTitle, otherParticipant } from '@/lib/conversations'
import { useUserSearch } from '@/hooks/use-user-search'
import { UserAvatar } from '@/components/chat/user-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Contract cap for each target list (`conversationIds` / `userIds`, 20 each). */
const MAX_PER_LIST = 20

function displayName(user: UserSummary): string {
  return user.displayName || user.username
}

function messagePreview(message: ChatMessage): string {
  const text = message.content?.trim()
  if (text) return text
  const first = message.attachments[0]
  if (first) return attachmentLabel(first.type, message.attachments.length)
  return 'Message'
}

function TargetCheck({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
        selected && 'border-primary bg-primary text-primary-foreground',
      )}
      aria-hidden
    >
      {selected && <Check className="h-3.5 w-3.5" />}
    </span>
  )
}

/**
 * Picks conversations and/or people to forward a message to
 * (`POST /conversations/:id/messages/:messageId/forward`). Each copy is
 * re-attributed to the sender and marked `forwarded`.
 */
export function ForwardDialog({
  open,
  onOpenChange,
  message,
  conversations,
  meId,
  onForwarded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: ChatMessage | null
  conversations: Conversation[]
  meId?: string
  onForwarded: (result: ForwardResult) => void
}) {
  const [query, setQuery] = useState('')
  const [conversationIds, setConversationIds] = useState<string[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [forwarding, setForwarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { results, loading, error: searchError } = useUserSearch(query)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setConversationIds([])
    setUsers([])
    setError(null)
    setForwarding(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !forwarding) onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, forwarding, onOpenChange])

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => conversationTitle(c, meId).toLowerCase().includes(q))
  }, [conversations, meId, query])

  const selectedUserIds = useMemo(() => new Set(users.map((u) => u.id)), [users])
  const people = useMemo(
    () => results.filter((user) => user.id !== meId),
    [results, meId],
  )

  const totalSelected = conversationIds.length + users.length
  const conversationsFull = conversationIds.length >= MAX_PER_LIST
  const peopleFull = users.length >= MAX_PER_LIST

  if (!open || !message) return null

  const toggleConversation = (id: string) => {
    setConversationIds((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : prev.length >= MAX_PER_LIST
          ? prev
          : [...prev, id],
    )
  }

  const toggleUser = (user: UserSummary) => {
    setUsers((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev.filter((u) => u.id !== user.id)
      if (prev.length >= MAX_PER_LIST) return prev
      return [...prev, user]
    })
  }

  const submit = async () => {
    if (forwarding || totalSelected === 0) return
    setForwarding(true)
    setError(null)
    try {
      const res = await api.post<ForwardResult>(
        `/conversations/${message.conversationId}/messages/${message.id}/forward`,
        {
          conversationIds,
          userIds: users.map((u) => u.id),
        },
      )
      onForwarded(res.data)
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not forward this message.'))
    } finally {
      setForwarding(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => !forwarding && onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Forward message"
        className="w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Forward message</h2>
            <p className="truncate text-xs text-muted-foreground">{messagePreview(message)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            disabled={forwarding}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          {users.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {users.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-1 pr-2 text-xs"
                >
                  <UserAvatar name={displayName(user)} avatarUrl={user.avatarUrl} size="sm" />
                  {displayName(user)}
                  <button
                    type="button"
                    onClick={() => toggleUser(user)}
                    aria-label={`Remove ${displayName(user)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="forward-search">Search chats and people</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forward-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or @username"
                className="pl-8"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {filteredConversations.length > 0 && (
              <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Chats
              </div>
            )}
            {filteredConversations.map((conversation) => {
              const isSelected = conversationIds.includes(conversation.id)
              const other = otherParticipant(conversation, meId)
              const name = conversationTitle(conversation, meId)
              return (
                <button
                  key={conversation.id}
                  type="button"
                  disabled={forwarding || (conversationsFull && !isSelected)}
                  onClick={() => toggleConversation(conversation.id)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b p-2.5 text-left transition-colors last:border-b-0 hover:bg-muted disabled:opacity-50',
                    isSelected && 'bg-muted',
                  )}
                >
                  <UserAvatar
                    name={name}
                    avatarUrl={conversation.type === 'direct' ? other?.avatarUrl : conversation.avatarUrl}
                    fallback={conversation.type === 'group' ? <Users className="h-4 w-4" /> : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {conversation.type === 'group'
                        ? `${conversation.participants.length} members`
                        : `@${other?.username ?? 'unknown'}`}
                    </span>
                  </span>
                  <TargetCheck selected={isSelected} />
                </button>
              )
            })}

            {query.trim() !== '' && (
              <>
                <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  People
                </div>
                {loading && (
                  <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                )}
                {!loading && searchError && (
                  <p className="p-4 text-sm text-destructive">{searchError}</p>
                )}
                {!loading && !searchError && people.length === 0 && (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No people match “{query.trim()}”.
                  </p>
                )}
                {!loading &&
                  people.map((user) => {
                    const isSelected = selectedUserIds.has(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        disabled={forwarding || (peopleFull && !isSelected)}
                        onClick={() => toggleUser(user)}
                        className={cn(
                          'flex w-full items-center gap-3 border-b p-2.5 text-left transition-colors last:border-b-0 hover:bg-muted disabled:opacity-50',
                          isSelected && 'bg-muted',
                        )}
                      >
                        <UserAvatar name={displayName(user)} avatarUrl={user.avatarUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {displayName(user)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{user.username}
                          </span>
                        </span>
                        <TargetCheck selected={isSelected} />
                      </button>
                    )
                  })}
              </>
            )}

            {filteredConversations.length === 0 && query.trim() === '' && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No conversations yet.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <span className="text-xs text-muted-foreground">
            {totalSelected === 0
              ? 'Choose at least one chat or person'
              : `${totalSelected} selected${conversationsFull || peopleFull ? ' (max 20 per list)' : ''}`}
          </span>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={forwarding || totalSelected === 0}
          >
            {forwarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
            Forward
          </Button>
        </div>
      </div>
    </div>
  )
}
