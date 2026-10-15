import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { Loader2, MessageSquarePlus, RefreshCw, Search, Settings, User, Users } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import type { Conversation, PaginatedConversations } from '@/types/api'
import { useAuth } from '@/contexts/auth-context'
import { usePresence } from '@/contexts/presence-context'
import { useSocket } from '@/contexts/socket-context'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/chat/user-avatar'
import { ProfileDialog } from '@/components/chat/profile-dialog'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewConversationDialog } from '@/components/chat/new-conversation-dialog'
import { useUserSearch } from '@/hooks/use-user-search'
import { USE_MOCK } from '@/lib/mock/config'
import { resetMock } from '@/lib/mock/data'
import { conversationTitle } from '@/lib/conversations'
import type { ChatOutletContext } from '@/pages/chat/context'

export function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, logout } = useAuth()
  const { getPresence, loadConversationPresence } = usePresence()
  const { socket } = useSocket()
  const navigate = useNavigate()
  const { conversationId } = useParams()

  const { results: searchResults, loading: searchLoading } = useUserSearch(search)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await api.get<PaginatedConversations>('/conversations')
        setConversations(res.data.items)
      } catch {
        setConversations([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Seed presence for everyone in the sidebar (kept live by `presence:update`).
  useEffect(() => {
    if (conversations.length === 0) return
    void loadConversationPresence(conversations.map((conversation) => conversation.id))
  }, [conversations, loadConversationPresence])

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === conversation.id)
      if (!existing) return [conversation, ...prev]
      return prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
    })
  }, [])

  // Keep the sidebar in sync with new conversations and group changes.
  useEffect(() => {
    if (!socket) return
    const handleConversation = (...args: unknown[]) => {
      const conversation = args[0] as Conversation
      if (conversation?.id) upsertConversation(conversation)
    }
    socket.on('conversation:new', handleConversation)
    socket.on('conversation:updated', handleConversation)
    return () => {
      socket.off('conversation:new', handleConversation)
      socket.off('conversation:updated', handleConversation)
    }
  }, [socket, upsertConversation])

  const startDirect = async (participant: { id: string }) => {
    try {
      const res = await api.post<{ conversation: Conversation }>('/conversations', {
        type: 'direct',
        participantIds: [participant.id],
      })
      upsertConversation(res.data.conversation)
      setSearch('')
      navigate(`/chat/${res.data.conversation.id}`)
    } catch {
      // Surface failures through the dialog flow instead; the sidebar stays quiet.
    }
  }

  const showRoom = Boolean(conversationId)

  return (
    <div className="flex h-svh">
      <aside
        className={cn(
          'w-full flex-col border-r md:flex md:max-w-xs',
          showRoom ? 'hidden' : 'flex',
        )}
      >
        <div className="flex items-center justify-between border-b p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <h1 className="text-lg font-semibold">Chatrix</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              onClick={() => setDialogOpen(true)}
            >
              <MessageSquarePlus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="space-y-2 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="pl-8"
              aria-label="Search people"
            />
          </div>

          {search.trim() !== '' && (
            <div className="rounded-lg border">
              {searchLoading && (
                <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <p className="p-3 text-center text-xs text-muted-foreground">No people found.</p>
              )}
              {!searchLoading &&
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => void startDirect(result)}
                    className="flex w-full items-center gap-2 border-b p-2 text-left last:border-b-0 hover:bg-muted"
                  >
                    <UserAvatar
                      name={result.displayName || result.username}
                      avatarUrl={result.avatarUrl}
                      className="h-8 w-8"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {result.displayName || result.username}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{result.username}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet. Search for someone or create a group.
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conversation) => {
                const other =
                  conversation.type === 'direct'
                    ? conversation.participants.find((p) => p.id !== user?.id)
                    : null
                const isActive = conversation.id === conversationId
                return (
                  <Link
                    key={conversation.id}
                    to={`/chat/${conversation.id}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md p-2 hover:bg-muted',
                      isActive && 'bg-muted',
                    )}
                  >
                    <UserAvatar
                      name={
                        conversation.type === 'group'
                          ? conversation.name || 'Group'
                          : other
                            ? other.displayName || other.username
                            : 'Conversation'
                      }
                      avatarUrl={conversation.type === 'direct' ? other?.avatarUrl : conversation.avatarUrl}
                      status={
                        conversation.type === 'direct' && other
                          ? getPresence(other.id)?.status
                          : undefined
                      }
                      className="h-9 w-9"
                      fallback={
                        conversation.type === 'group' ? <Users className="h-4 w-4" /> : undefined
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {conversationTitle(conversation, user?.id)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {conversation.type === 'group'
                          ? `${conversation.participants.length} members`
                          : conversation.lastMessageAt
                            ? new Date(conversation.lastMessageAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'No messages yet'}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="View your profile"
            className="flex min-w-0 items-center gap-2 rounded-lg p-1 pr-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <UserAvatar
              name={user?.displayName || user?.username || 'You'}
              avatarUrl={user?.avatarUrl}
              className="h-8 w-8"
              fallback={user ? undefined : <User className="h-4 w-4" />}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {user?.displayName || user?.username}
              </div>
              <div className="truncate text-xs text-muted-foreground">@{user?.username}</div>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Account menu" />}>
              <Settings className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <User className="h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
              {USE_MOCK && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      resetMock()
                      window.location.reload()
                    }}
                  >
                    <RefreshCw className="h-4 w-4" /> Reset demo data
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className={cn('min-w-0 flex-1 flex-col', showRoom ? 'flex' : 'hidden md:flex')}>
        <Outlet
          context={
            {
              conversations,
              conversationsLoading: loading,
              upsertConversation,
            } satisfies ChatOutletContext
          }
        />
      </main>

      <NewConversationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={upsertConversation}
      />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        userId={user?.id ?? null}
      />
    </div>
  )
}
