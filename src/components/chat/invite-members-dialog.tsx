import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { Conversation, UserSummary } from '@/types/api'
import { useUserSearch } from '@/hooks/use-user-search'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/chat/user-avatar'

/** Client-side guard so one invite request stays reasonable. */
const MAX_INVITES = 50

function displayName(user: UserSummary): string {
  return user.displayName || user.username
}

/**
 * Invite users to a group (`POST /conversations/:id/participants`). Anyone in the
 * group may invite; ids already in the group are excluded from the results.
 */
export function InviteMembersDialog({
  open,
  onOpenChange,
  conversation,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: Conversation
  onUpdated: (conversation: Conversation) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<UserSummary[]>([])
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { results, loading, error: searchError } = useUserSearch(query)

  const existingIds = useMemo(
    () => new Set(conversation.participants.map((p) => p.id)),
    [conversation.participants],
  )
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected])
  const candidates = useMemo(
    () => results.filter((user) => !existingIds.has(user.id)),
    [results, existingIds],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected([])
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !inviting) onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, inviting, onOpenChange])

  if (!open) return null

  const toggle = (user: UserSummary) => {
    setSelected((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev.filter((u) => u.id !== user.id)
      if (prev.length >= MAX_INVITES) return prev
      return [...prev, user]
    })
  }

  const invite = async () => {
    if (inviting || selected.length === 0) return
    setInviting(true)
    setError(null)
    try {
      const res = await api.post<{ conversation: Conversation }>(
        `/conversations/${conversation.id}/participants`,
        { participantIds: selected.map((u) => u.id) },
      )
      onUpdated(res.data.conversation)
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not add these members.'))
    } finally {
      setInviting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => !inviting && onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add members"
        className="w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-semibold">Add members</h2>
            <p className="text-xs text-muted-foreground">
              Invite people to {conversation.name || 'this group'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            disabled={inviting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-1 pr-2 text-xs"
                >
                  <UserAvatar
                    name={displayName(user)}
                    avatarUrl={user.avatarUrl}
                    size="sm"
                  />
                  {displayName(user)}
                  <button
                    type="button"
                    onClick={() => toggle(user)}
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
            <Label htmlFor="invite-search">Find people</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or @username"
                className="pl-8"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 min-h-24 overflow-y-auto rounded-lg border">
            {loading && (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!loading && searchError && <p className="p-4 text-sm text-destructive">{searchError}</p>}
            {!loading && !searchError && query.trim() === '' && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Start typing to find people.
              </p>
            )}
            {!loading && !searchError && query.trim() !== '' && candidates.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No people to invite match “{query.trim()}”.
              </p>
            )}
            {!loading &&
              candidates.map((user) => {
                const isSelected = selectedIds.has(user.id)
                const atLimit = !isSelected && selected.length >= MAX_INVITES
                return (
                  <button
                    key={user.id}
                    type="button"
                    disabled={inviting || atLimit}
                    onClick={() => toggle(user)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b p-2.5 text-left transition-colors last:border-b-0 hover:bg-muted disabled:opacity-50',
                      isSelected && 'bg-muted',
                    )}
                  >
                    <UserAvatar
                      name={displayName(user)}
                      avatarUrl={user.avatarUrl}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {displayName(user)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{user.username}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-md border',
                        isSelected && 'border-primary bg-primary text-primary-foreground',
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <span className="text-xs text-muted-foreground">
            {selected.length === 0 ? 'Select people to invite' : `${selected.length} selected`}
          </span>
          <Button
            type="button"
            onClick={() => void invite()}
            disabled={inviting || selected.length === 0}
          >
            {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add {selected.length > 0 ? selected.length : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
