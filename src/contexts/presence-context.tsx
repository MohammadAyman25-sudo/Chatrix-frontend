import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import api from '@/lib/api'
import type { PresenceEntry } from '@/types/api'
import { useSocket } from './socket-context'
import { useAuth } from './auth-context'

/**
 * App-wide presence store.
 *
 * Seeded from `GET /conversations/:id/presence` when a conversation opens, then
 * kept live by the global `presence:update` socket event. Typing/recording are
 * conversation-scoped and handled by the room instead.
 */
type PresenceContextValue = {
  getPresence: (userId: string | null | undefined) => PresenceEntry | undefined
  /** Merges entries (from an HTTP seed or a socket event). */
  mergePresence: (items: PresenceEntry[]) => void
  /** Fetches presence for one or more conversations once; safe to call often. */
  loadConversationPresence: (conversationIds: string | string[]) => Promise<void>
}

const PresenceContext = createContext<PresenceContextValue | undefined>(undefined)

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const { user } = useAuth()
  const [entries, setEntries] = useState<Record<string, PresenceEntry>>({})
  const requested = useRef<Set<string>>(new Set())

  const mergePresence = useCallback((items: PresenceEntry[]) => {
    if (items.length === 0) return
    setEntries((prev) => {
      const next = { ...prev }
      let changed = false
      for (const item of items) {
        if (!item?.userId) continue
        const current = next[item.userId]
        if (
          !current ||
          current.status !== item.status ||
          current.lastSeenAt !== (item.lastSeenAt ?? null)
        ) {
          next[item.userId] = {
            userId: item.userId,
            status: item.status,
            lastSeenAt: item.lastSeenAt ?? null,
          }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  // Live updates from the server (contacts coming online / going offline).
  useEffect(() => {
    if (!socket) return
    const handler = (...args: unknown[]) => {
      const payload = args[0] as
        | { userId?: string; status?: PresenceEntry['status']; lastSeenAt?: string | null }
        | undefined
      if (!payload?.userId || !payload.status) return
      mergePresence([
        { userId: payload.userId, status: payload.status, lastSeenAt: payload.lastSeenAt ?? null },
      ])
    }
    socket.on('presence:update', handler)
    return () => {
      socket.off('presence:update', handler)
    }
  }, [socket, mergePresence])

  // The signed-in user is online by definition.
  useEffect(() => {
    if (!user) return
    mergePresence([{ userId: user.id, status: 'online', lastSeenAt: null }])
  }, [user, mergePresence])

  const loadConversationPresence = useCallback(
    async (conversationIds: string | string[]) => {
      const ids = (Array.isArray(conversationIds) ? conversationIds : [conversationIds]).filter(
        (id) => id && !requested.current.has(id),
      )
      if (ids.length === 0) return
      for (const id of ids) requested.current.add(id)

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await api.get<{ items: PresenceEntry[] }>(`/conversations/${id}/presence`)
          return res.data.items
        }),
      )
      const merged: PresenceEntry[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') merged.push(...result.value)
      }
      mergePresence(merged)
    },
    [mergePresence],
  )

  const getPresence = useCallback(
    (userId: string | null | undefined) => (userId ? entries[userId] : undefined),
    [entries],
  )

  const value = useMemo(
    () => ({ getPresence, mergePresence, loadConversationPresence }),
    [getPresence, mergePresence, loadConversationPresence],
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  const ctx = useContext(PresenceContext)
  if (!ctx) throw new Error('usePresence must be used within PresenceProvider')
  return ctx
}
