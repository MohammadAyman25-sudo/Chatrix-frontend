import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Search, User, Users, X } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { Conversation, UserSummary } from '@/types/api'
import { useUserSearch } from '@/hooks/use-user-search'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'direct' | 'group'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function displayName(user: UserSummary): string {
  return user.displayName || user.username
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (conversation: Conversation) => void
}) {
  const [mode, setMode] = useState<Mode>('direct')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<UserSummary[]>([])
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { results, loading, error: searchError } = useUserSearch(query)

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected([])
    setGroupName('')
    setError(null)
    setMode('direct')
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, creating, onOpenChange])

  if (!open) return null

  const toggleSelected = (user: UserSummary) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    )
  }

  const startDirect = async (user: UserSummary) => {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await api.post<{ conversation: Conversation }>('/conversations', {
        type: 'direct',
        participantIds: [user.id],
      })
      onCreated(res.data.conversation)
      onOpenChange(false)
      navigate(`/chat/${res.data.conversation.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not start the conversation.'))
    } finally {
      setCreating(false)
    }
  }

  const createGroup = async () => {
    if (creating || selected.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const res = await api.post<{ conversation: Conversation }>('/conversations', {
        type: 'group',
        name: groupName.trim() || 'New group',
        participantIds: selected.map((u) => u.id),
      })
      onCreated(res.data.conversation)
      onOpenChange(false)
      navigate(`/chat/${res.data.conversation.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the group.'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => !creating && onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New conversation"
        className="w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-base font-semibold">New conversation</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 border-b p-2">
          {(['direct', 'group'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                mode === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {value === 'direct' ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              {value === 'direct' ? 'Direct' : 'Group'}
            </button>
          ))}
        </div>

        <div className="space-y-3 p-4">
          {mode === 'group' && selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-1 pr-2 text-xs"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {initials(displayName(user))}
                    </AvatarFallback>
                  </Avatar>
                  {displayName(user)}
                  <button
                    type="button"
                    onClick={() => toggleSelected(user)}
                    aria-label={`Remove ${displayName(user)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {mode === 'group' && (
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Design Crew"
                maxLength={60}
              />
            </div>
          )}

          <div className="space-y-1.5">
            {mode === 'group' && <Label htmlFor="member-search">Members</Label>}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="member-search"
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people by name or @username"
                className="pl-8"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="max-h-64 min-h-24 overflow-y-auto rounded-lg border">
            {loading && (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!loading && searchError && (
              <p className="p-4 text-sm text-destructive">{searchError}</p>
            )}
            {!loading && !searchError && query.trim() === '' && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Start typing to find people.
              </p>
            )}
            {!loading && !searchError && query.trim() !== '' && results.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No people match “{query.trim()}”.
              </p>
            )}
            {!loading &&
              results.map((user) => {
                const isSelected = selectedIds.has(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    disabled={creating}
                    onClick={() => (mode === 'direct' ? void startDirect(user) : toggleSelected(user))}
                    className={cn(
                      'flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-muted',
                      'border-b last:border-b-0',
                      isSelected && 'bg-muted',
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback>{initials(displayName(user))}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {displayName(user)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{user.username}
                        {user.bio ? ` · ${user.bio}` : ''}
                      </span>
                    </span>
                    {mode === 'group' && (
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-md border',
                          isSelected && 'border-primary bg-primary text-primary-foreground',
                        )}
                        aria-hidden
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {mode === 'group' && (
          <div className="flex items-center justify-between gap-3 border-t p-4">
            <span className="text-xs text-muted-foreground">
              {selected.length === 0
                ? 'Select at least one person'
                : `${selected.length} selected`}
            </span>
            <Button type="button" onClick={() => void createGroup()} disabled={creating || selected.length === 0}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create group
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
