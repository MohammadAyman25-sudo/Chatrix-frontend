import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { AlertCircle, Check, ChevronUp, Loader2, Lock, MessageSquare, Users, X } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { AppSocket } from '@/lib/app-socket'
import type {
  Attachment,
  ChatMessage,
  Conversation,
  ForwardResult,
  Message,
  MessageReply,
  PaginatedMessages,
  Participant,
  SendMessageResult,
} from '@/types/api'
import { useAuth } from '@/contexts/auth-context'
import { useSocket } from '@/contexts/socket-context'
import { usePresence } from '@/contexts/presence-context'
import { presenceLabel } from '@/lib/presence'
import { canReplyPrivately } from '@/lib/messages'
import { Button } from '@/components/ui/button'
import { Composer, type ComposerHandle, type ComposerSendInput } from '@/components/chat/composer'
import { Lightbox } from '@/components/chat/message-attachments'
import { MessageItem } from '@/components/chat/message-item'
import { ConversationHeader } from '@/components/chat/conversation-header'
import { MemberPanel } from '@/components/chat/member-panel'
import { MediaPanel } from '@/components/chat/media-panel'
import { MessageSearchPanel } from '@/components/chat/message-search-panel'
import { ProfileDialog } from '@/components/chat/profile-dialog'
import { ForwardDialog } from '@/components/chat/forward-dialog'
import { MessageInfoDialog } from '@/components/chat/message-info-dialog'
import type { ChatOutletContext } from '@/pages/chat/context'

const PAGE_SIZE = 30

/**
 * Delivery status only ever moves forward (`sent` -> `delivered` -> `read`).
 * The `message:status` event is conversation-scoped, so a stale `delivered`
 * event (e.g. when the recipient reconnects) must never overwrite a message
 * the recipient has already read.
 */
const STATUS_RANK: Record<Message['status'], number> = { sent: 0, delivered: 1, read: 2 }

type AckResult = {
  ok?: boolean
  message?: Message
  conversation?: Conversation
  error?: string
}

/** Emits a socket event that expects an ack, with a safety timeout. */
function emitWithAck(
  socket: AppSocket,
  event: string,
  payload: unknown,
  timeoutMs = 15000,
): Promise<AckResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('The server did not respond. Check your connection and try again.'))
    }, timeoutMs)
    try {
      socket.emit(event, payload, (result: AckResult) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(result)
      })
    } catch (error) {
      settled = true
      window.clearTimeout(timer)
      reject(error)
    }
  })
}

/** Fills in fields the message list endpoint may omit, so the UI can rely on them. */
function normalizeMessage(message: Message): ChatMessage {
  return {
    ...message,
    content: message.content ?? '',
    type: message.type ?? (message.attachments?.[0]?.type ?? 'text'),
    attachments: message.attachments ?? [],
    replyTo: message.replyTo ?? null,
    editedAt: message.editedAt ?? null,
    forwarded: message.forwarded ?? false,
  }
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function formatDay(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function ChatRoom() {
  const { conversationId = '' } = useParams<{ conversationId: string }>()
  const { conversations, conversationsLoading, upsertConversation } =
    useOutletContext<ChatOutletContext>()
  const { socket, connected } = useSocket()
  const { getPresence, loadConversationPresence } = usePresence()
  const { user } = useAuth()
  const navigate = useNavigate()

  const conversation: Conversation | null = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  )

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const [recordingUserIds, setRecordingUserIds] = useState<string[]>([])
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [pendingJumpId, setPendingJumpId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ attachments: Attachment[]; index: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [forwardTarget, setForwardTarget] = useState<ChatMessage | null>(null)
  const [forwardNotice, setForwardNotice] = useState<string | null>(null)
  const [infoTarget, setInfoTarget] = useState<ChatMessage | null>(null)
  const [privateReplyNotice, setPrivateReplyNotice] = useState<{
    name: string
    conversationId: string | null
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [locatingMessage, setLocatingMessage] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ComposerHandle>(null)
  const dragDepth = useRef(0)
  const skipAutoScroll = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const cursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(false)
  const messageRefs = useRef(new Map<string, HTMLDivElement>())
  const highlightTimer = useRef<number | undefined>(undefined)

  const isGroup = conversation?.type === 'group'

  const meParticipant = useMemo<Participant>(
    () => ({
      id: user?.id ?? '',
      username: user?.username ?? '',
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    }),
    [user],
  )

  const otherParticipant = useMemo<Participant | null>(() => {
    if (!conversation || conversation.type !== 'direct') return null
    return (
      conversation.participants.find((p) => p.id !== user?.id) ??
      conversation.participants[0] ??
      null
    )
  }, [conversation, user?.id])

  const otherPresence = getPresence(otherParticipant?.id)

  const onlineCount = useMemo(() => {
    if (!conversation) return 0
    return conversation.participants.filter(
      (p) => p.id !== user?.id && getPresence(p.id)?.status === 'online',
    ).length
  }, [conversation, user?.id, getPresence])

  const presenceText = isGroup
    ? onlineCount > 0
      ? `${onlineCount} online`
      : null
    : presenceLabel(otherPresence)
  const presenceOnline = isGroup ? false : otherPresence?.status === 'online'

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  /* ------------------------------ initial load ----------------------------- */
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setActionError(null)
    setMessages([])
    setTypingUserIds([])
    setRecordingUserIds([])
    setReplyTo(null)
    setCursor(null)
    setHasMore(false)

    ;(async () => {
      try {
        const res = await api.get<PaginatedMessages>(
          `/conversations/${conversationId}/messages`,
          { params: { limit: PAGE_SIZE } },
        )
        if (cancelled) return
        setMessages([...res.data.items].reverse().map(normalizeMessage))
        setCursor(res.data.nextCursor)
        setHasMore(res.data.hasMore)
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, 'Could not load messages.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId])

  /* ------------------------------- presence -------------------------------- */
  useEffect(() => {
    if (!conversationId) return
    void loadConversationPresence(conversationId)
  }, [conversationId, loadConversationPresence])

  // The members panel, media panel, search and any open profile belong to the
  // previous conversation.
  useEffect(() => {
    setMembersOpen(false)
    setMediaOpen(false)
    setSearchOpen(false)
    setEditingId(null)
    setProfileUserId(null)
    setPendingJumpId(null)
    setLocatingMessage(false)
    setInfoTarget(null)
    setPrivateReplyNotice(null)
  }, [conversationId])

  // Escape backs out one layer at a time: dialogs (profile, forward, lightbox)
  // handle it themselves, then search, then the side panels, then the chat.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (profileUserId || lightbox || forwardTarget || infoTarget) return
      if (searchOpen) {
        event.stopPropagation()
        setSearchOpen(false)
        return
      }
      if (membersOpen || mediaOpen) {
        event.stopPropagation()
        setMembersOpen(false)
        setMediaOpen(false)
        return
      }
      event.stopPropagation()
      navigate('/chat')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [profileUserId, lightbox, forwardTarget, infoTarget, searchOpen, membersOpen, mediaOpen, navigate])

  /* ------------------------------ scroll to end ---------------------------- */
  useEffect(() => {
    if (skipAutoScroll.current) {
      skipAutoScroll.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, conversationId])

  /* --------------------------- mark conversation read ---------------------- */
  useEffect(() => {
    if (!socket || !conversationId) return
    socket.emit('message:read', { conversationId })
  }, [socket, conversationId, messages.length])

  /* --------------------------------- socket -------------------------------- */
  useEffect(() => {
    if (!socket || !conversationId) return

    const handleNew = (...args: unknown[]) => {
      const incoming = args[0] as Message
      if (incoming?.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.some((m) => m.id === incoming.id) ? prev : [...prev, normalizeMessage(incoming)],
      )
      socket.emit('message:read', { conversationId })
    }

    const handleTyping = (...args: unknown[]) => {
      const payload = args[0] as { conversationId: string; userId: string; isTyping: boolean }
      if (payload?.conversationId !== conversationId || payload.userId === user?.id) return
      setTypingUserIds((prev) =>
        payload.isTyping
          ? prev.includes(payload.userId)
            ? prev
            : [...prev, payload.userId]
          : prev.filter((id) => id !== payload.userId),
      )
    }

    const handleRecording = (...args: unknown[]) => {
      const payload = args[0] as { conversationId: string; userId: string; isRecording: boolean }
      if (payload?.conversationId !== conversationId || payload.userId === user?.id) return
      setRecordingUserIds((prev) =>
        payload.isRecording
          ? prev.includes(payload.userId)
            ? prev
            : [...prev, payload.userId]
          : prev.filter((id) => id !== payload.userId),
      )
    }

    // Another participant edited one of their messages: replace its content in
    // place. The editor themself gets the updated message via the ack instead.
    const handleEdited = (...args: unknown[]) => {
      const incoming = args[0] as Message
      if (incoming?.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === incoming.id
            ? { ...normalizeMessage(incoming), pending: m.pending, failed: m.failed }
            : m,
        ),
      )
    }

    const handleStatus = (...args: unknown[]) => {
      const payload = args[0] as { conversationId: string; status: Message['status'] }
      if (payload?.conversationId !== conversationId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.sender.id === user?.id &&
          (STATUS_RANK[payload.status] ?? 0) > (STATUS_RANK[m.status] ?? 0)
            ? { ...m, status: payload.status }
            : m,
        ),
      )
    }

    const handleConversation = (...args: unknown[]) => {
      const created = args[0] as Conversation
      if (created?.id) upsertConversation(created)
    }

    // Groups can be renamed, re-iconed, or gain members from any client.
    const handleConversationUpdated = (...args: unknown[]) => {
      const updated = args[0] as Conversation
      if (updated?.id) upsertConversation(updated)
    }

    socket.on('message:new', handleNew)
    socket.on('message:edited', handleEdited)
    socket.on('typing:update', handleTyping)
    socket.on('recording:update', handleRecording)
    socket.on('message:status', handleStatus)
    socket.on('conversation:new', handleConversation)
    socket.on('conversation:updated', handleConversationUpdated)

    return () => {
      socket.off('message:new', handleNew)
      socket.off('message:edited', handleEdited)
      socket.off('typing:update', handleTyping)
      socket.off('recording:update', handleRecording)
      socket.off('message:status', handleStatus)
      socket.off('conversation:new', handleConversation)
      socket.off('conversation:updated', handleConversationUpdated)
    }
  }, [socket, conversationId, user?.id, upsertConversation])

  const loadEarlier = useCallback(async () => {
    if (!conversationId || !cursor || loadingMore) return
    setLoadingMore(true)
    const container = scrollRef.current
    const previousHeight = container?.scrollHeight ?? 0
    try {
      const res = await api.get<PaginatedMessages>(
        `/conversations/${conversationId}/messages`,
        { params: { limit: PAGE_SIZE, cursor } },
      )
      skipAutoScroll.current = true
      setMessages((prev) => [...[...res.data.items].reverse().map(normalizeMessage), ...prev])
      setCursor(res.data.nextCursor)
      setHasMore(res.data.hasMore)
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - previousHeight
      })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load earlier messages.'))
    } finally {
      setLoadingMore(false)
    }
  }, [conversationId, cursor, loadingMore])

  /* --------------------------------- sending ------------------------------- */

  /** Sends over the socket; falls back to REST for text when the socket is unavailable. */
  const deliver = useCallback(
    async (input: ComposerSendInput): Promise<SendMessageResult> => {
      if (socket && connected) {
        const result = await emitWithAck(socket, 'message:send', {
          conversationId,
          content: input.content || undefined,
          type: input.type,
          attachments: input.attachments.length > 0 ? input.attachments : undefined,
          replyToId: input.replyToId,
          replyPrivately: input.replyPrivately,
          clientTempId: crypto.randomUUID(),
        })
        if (!result.ok || !result.message) {
          throw new Error(result.error || 'Message failed to send.')
        }
        return { message: result.message, conversation: result.conversation }
      }

      // No socket: everything still goes over REST — `POST /conversations/:id/messages`
      // accepts the confirmed `attachments` exactly like `message:send` does.
      const res = await api.post<SendMessageResult>(`/conversations/${conversationId}/messages`, {
        content: input.content || undefined,
        type: input.type,
        ...(input.attachments.length > 0 ? { attachments: input.attachments } : {}),
        ...(input.replyToId ? { replyToId: input.replyToId } : {}),
        ...(input.replyPrivately ? { replyPrivately: true } : {}),
      })
      return res.data
    },
    [conversationId, socket, connected],
  )

  const sendMessage = useCallback(
    async (input: ComposerSendInput) => {
      const source = input.replyToId
        ? messagesRef.current.find((m) => m.id === input.replyToId)
        : undefined

      // A private reply is delivered as a DM to the quoted author, so it does
      // not belong in the open conversation's list — track it via a notice.
      if (input.replyPrivately && source) {
        setActionError(null)
        const result = await deliver(input)
        if (result.conversation) upsertConversation(result.conversation)
        const authorId = source.sender.id
        const existing = conversations.find(
          (c) => c.type === 'direct' && c.participants.some((p) => p.id === authorId),
        )
        setPrivateReplyNotice({
          name: source.sender.displayName || source.sender.username,
          conversationId: result.conversation?.id ?? existing?.id ?? null,
        })
        return result.message
      }

      const optimisticId = `pending:${crypto.randomUUID()}`
      const optimistic: ChatMessage = {
        id: optimisticId,
        conversationId,
        content: input.content,
        type: input.type,
        attachments: input.attachments,
        sender: meParticipant,
        replyTo: source ? toReply(source) : null,
        status: 'sent',
        editedAt: null,
        forwarded: false,
        createdAt: new Date().toISOString(),
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])
      setActionError(null)

      try {
        const result = await deliver(input)
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? normalizeMessage(result.message) : m)),
        )
        return result.message
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, failed: true } : m)),
        )
        throw err instanceof Error ? err : new Error('Message failed to send.')
      }
    },
    [conversationId, deliver, meParticipant, conversations, upsertConversation],
  )

  const retryMessage = useCallback(
    async (message: ChatMessage) => {
      if (!message.failed) return
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, pending: true, failed: false } : m)),
      )
      setActionError(null)
      try {
        const result = await deliver({
          content: message.content,
          type: message.type,
          attachments: message.attachments,
          replyToId: message.replyTo?.id,
        })
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? normalizeMessage(result.message) : m)),
        )
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, pending: false, failed: true } : m)),
        )
        setActionError(apiErrorMessage(err, 'Message failed to send.'))
      }
    },
    [deliver],
  )

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket || !conversationId) return
      socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId })
    },
    [socket, conversationId],
  )

  const handleRecordingChange = useCallback(
    (isRecording: boolean, cid: string) => {
      if (!socket) return
      socket.emit(isRecording ? 'recording:start' : 'recording:stop', { conversationId: cid })
    },
    [socket],
  )

  /* ------------------------------ reply / jump ----------------------------- */

  const handleReply = useCallback((message: ChatMessage) => {
    if (message.pending || message.failed) return
    setReplyTo(message)
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [])

  const cancelReply = useCallback(() => setReplyTo(null), [])

  const handleForward = useCallback((message: ChatMessage) => {
    if (message.pending || message.failed) return
    setForwardTarget(message)
  }, [])

  const handleMessageInfo = useCallback((message: ChatMessage) => {
    if (message.pending || message.failed) return
    setInfoTarget(message)
  }, [])

  const handleForwarded = useCallback(
    (result: ForwardResult) => {
      for (const updated of result.conversations ?? []) upsertConversation(updated)
      // Copies that landed in this conversation are inserted locally: the
      // forwarder does not receive `message:new` for messages they sent.
      const here = result.messages
        .filter((message) => message.conversationId === conversationId)
        .map(normalizeMessage)
      if (here.length > 0) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id))
          const additions = here.filter((m) => !existing.has(m.id))
          return additions.length > 0 ? [...prev, ...additions] : prev
        })
      }
      const count = result.messages.length
      setForwardNotice(count === 1 ? 'Forwarded to 1 chat' : `Forwarded to ${count} chats`)
    },
    [conversationId, upsertConversation],
  )

  useEffect(() => {
    if (!forwardNotice) return
    const timer = window.setTimeout(() => setForwardNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [forwardNotice])

  /* -------------------------------- editing -------------------------------- */

  const startEdit = useCallback((message: ChatMessage) => {
    if (message.pending || message.failed) return
    setEditingId(message.id)
  }, [])

  const cancelEdit = useCallback(() => setEditingId(null), [])

  const submitEdit = useCallback(
    async (message: ChatMessage, content: string) => {
      setActionError(null)

      // Replace the message in place, keeping any optimistic flags untouched.
      const apply = (updated: Message) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...normalizeMessage(updated), pending: m.pending, failed: m.failed }
              : m,
          ),
        )
      }

      try {
        if (socket && connected) {
          const result = await emitWithAck(socket, 'message:edit', {
            conversationId,
            messageId: message.id,
            content,
          })
          if (!result.ok || !result.message) {
            throw new Error(result.error || 'The message could not be edited.')
          }
          apply(result.message)
        } else {
          const res = await api.patch<{ message: Message }>(
            `/conversations/${conversationId}/messages/${message.id}`,
            { content },
          )
          apply(res.data.message)
        }
        setEditingId(null)
      } catch (err) {
        setActionError(apiErrorMessage(err, 'The message could not be edited.'))
        // Rethrow so the inline editor stays open and keeps the draft.
        throw err instanceof Error ? err : new Error('The message could not be edited.')
      }
    },
    [conversationId, socket, connected],
  )

  /* --------------------------- panels / overlays --------------------------- */

  // Members, media and search share the same space, so opening one closes the others.
  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (!open) {
        setMediaOpen(false)
        setMembersOpen(false)
      }
      return !open
    })
  }, [])

  const toggleMedia = useCallback(() => {
    setMediaOpen((open) => {
      if (!open) {
        setSearchOpen(false)
        setMembersOpen(false)
      }
      return !open
    })
  }, [])

  const handleOpenInfo = useCallback(() => {
    if (isGroup) {
      setSearchOpen(false)
      setMediaOpen(false)
      setMembersOpen((open) => !open)
      return
    }
    if (otherParticipant?.id) {
      setSearchOpen(false)
      setMediaOpen(false)
      setProfileUserId(otherParticipant.id)
    }
  }, [isGroup, otherParticipant])

  const jumpToMessage = useCallback((id: string) => {
    const node = messageRefs.current.get(id)
    if (!node) {
      setPendingJumpId(id)
      return
    }
    node.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    setHighlightedId(id)
    window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 1500)
  }, [])

  // If the quoted message was not loaded yet, retry once it appears.
  useEffect(() => {
    if (!pendingJumpId) return
    if (messageRefs.current.has(pendingJumpId)) {
      const id = pendingJumpId
      setPendingJumpId(null)
      jumpToMessage(id)
    }
  }, [pendingJumpId, messages, jumpToMessage])

  /**
   * Jumps to a message chosen from search results. The target may live on an
   * older page that has not been fetched yet, so walk backwards until it is
   * loaded (bounded), letting the `pendingJumpId` effect do the actual scroll.
   */
  const revealMessage = useCallback(
    async (messageId: string) => {
      setSearchOpen(false)
      if (messageRefs.current.has(messageId)) {
        jumpToMessage(messageId)
        return
      }
      setPendingJumpId(messageId)
      if (!hasMoreRef.current) return

      setLocatingMessage(true)
      try {
        let next = cursorRef.current
        let guard = 0
        while (next && guard < 20) {
          guard += 1
          const res = await api.get<PaginatedMessages>(
            `/conversations/${conversationId}/messages`,
            { params: { limit: PAGE_SIZE, cursor: next } },
          )
          const older = [...res.data.items].reverse().map(normalizeMessage)
          skipAutoScroll.current = true
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id))
            const additions = older.filter((m) => !existing.has(m.id))
            return additions.length > 0 ? [...additions, ...prev] : prev
          })
          if (older.some((m) => m.id === messageId)) break
          if (!res.data.hasMore) break
          next = res.data.nextCursor
        }
      } catch (err) {
        setActionError(apiErrorMessage(err, 'Could not load the message.'))
      } finally {
        setLocatingMessage(false)
      }
    },
    [conversationId, jumpToMessage],
  )

  const handleSearchSelect = useCallback(
    (messageId: string) => {
      void revealMessage(messageId)
    },
    [revealMessage],
  )

  useEffect(() => {
    return () => window.clearTimeout(highlightTimer.current)
  }, [])

  const typingNames = useMemo(() => {
    if (!conversation) return []
    return typingUserIds
      .map((id) => conversation.participants.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => p.displayName || p.username)
  }, [conversation, typingUserIds])

  const recordingNames = useMemo(() => {
    if (!conversation) return []
    return recordingUserIds
      .map((id) => conversation.participants.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => p.displayName || p.username)
  }, [conversation, recordingUserIds])

  /* ------------------------------- drag & drop ----------------------------- */
  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const handleDragEnter = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }
  const handleDragOver = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const handleDragLeave = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }
  const handleDrop = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) composerRef.current?.addFiles(files)
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {conversationsLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </span>
        ) : (
          'This conversation is not available.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ConversationHeader
          conversation={conversation}
          meId={user?.id}
          connected={connected}
          typingNames={typingNames}
          recordingNames={recordingNames}
          presenceText={presenceText}
          presenceOnline={presenceOnline}
          infoActive={isGroup ? membersOpen : false}
          onOpenInfo={handleOpenInfo}
          onBack={() => navigate('/chat')}
          searchActive={searchOpen}
          onToggleSearch={toggleSearch}
          mediaActive={mediaOpen}
          onToggleMedia={toggleMedia}
        />

        <div className="relative flex min-h-0 flex-1 flex-col">
          {locatingMessage && (
            <div className="flex items-center justify-center gap-2 border-b bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Finding the message…
            </div>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {hasMore && (
            <div className="mb-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadEarlier()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
                Load earlier messages
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
            </div>
          )}

          {!loading && error && (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                {isGroup ? (
                  <Users className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Say hello, or share a photo, video, voice note, or document.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && messages.length > 0 && (
            <div className="flex flex-col gap-1">
              {messages.map((message, index) => {
                const previous = messages[index - 1]
                const isOwn = message.sender.id === user?.id
                const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)
                const sameSender =
                  previous?.sender.id === message.sender.id &&
                  !previous.replyTo &&
                  !newDay &&
                  new Date(message.createdAt).getTime() -
                    new Date(previous.createdAt).getTime() <
                    5 * 60 * 1000

                return (
                  <div
                    key={message.id}
                    ref={(el) => {
                      if (el) messageRefs.current.set(message.id, el)
                      else messageRefs.current.delete(message.id)
                    }}
                  >
                    {newDay && (
                      <div className="my-3 flex items-center gap-3">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {formatDay(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className={sameSender ? 'mt-0.5' : 'mt-3'}>
                      <MessageItem
                        message={message}
                        isOwn={isOwn}
                        showSender={Boolean(isGroup) && !isOwn && !sameSender}
                        showAvatar={!isOwn && !sameSender}
                        highlighted={highlightedId === message.id}
                        onOpenAttachment={(attachments, attachmentIndex) =>
                          setLightbox({ attachments, index: attachmentIndex })
                        }
                        onReply={handleReply}
                        onForward={handleForward}
                        onOpenInfo={handleMessageInfo}
                        onRetry={(target) => void retryMessage(target)}
                        onJumpToMessage={jumpToMessage}
                        onStartEdit={startEdit}
                        editing={editingId === message.id}
                        onCancelEdit={cancelEdit}
                        onSubmitEdit={submitEdit}
                      />
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="rounded-xl border-2 border-dashed border-primary px-6 py-4 text-sm font-medium text-primary">
              Drop files here to attach
            </div>
          </div>
        )}

        {forwardNotice && (
          <div className="flex items-center gap-2 border-t bg-emerald-500/10 px-4 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{forwardNotice}</span>
            <button
              type="button"
              onClick={() => setForwardNotice(null)}
              aria-label="Dismiss"
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-emerald-500/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {privateReplyNotice && (
          <div className="flex items-center gap-2 border-t bg-primary/10 px-4 py-2 text-xs text-primary">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              Replied privately to {privateReplyNotice.name}
            </span>
            {privateReplyNotice.conversationId && (
              <button
                type="button"
                onClick={() => {
                  const target = privateReplyNotice.conversationId
                  setPrivateReplyNotice(null)
                  if (target) navigate(`/chat/${target}`)
                }}
                className="font-medium underline underline-offset-2"
              >
                Open chat
              </button>
            )}
            <button
              type="button"
              onClick={() => setPrivateReplyNotice(null)}
              aria-label="Dismiss"
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-primary/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Composer
          ref={composerRef}
          conversationId={conversationId}
          replyTo={replyTo}
          onCancelReply={cancelReply}
          canReplyPrivately={
            Boolean(isGroup) &&
            replyTo !== null &&
            canReplyPrivately(replyTo, replyTo.sender.id === user?.id)
          }
          onSend={sendMessage}
          onTyping={handleTyping}
          onRecordingChange={handleRecordingChange}
          onError={setActionError}
        />

        {lightbox && (
          <Lightbox
            attachments={lightbox.attachments}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}

        {searchOpen && (
          <div className="absolute inset-0 z-20 bg-background">
            <MessageSearchPanel
              conversation={conversation}
              meId={user?.id}
              onSelect={handleSearchSelect}
              onClose={() => setSearchOpen(false)}
            />
          </div>
        )}
        </div>
      </div>

      {mediaOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMediaOpen(false)}
            aria-hidden="true"
          />
          <MediaPanel
            conversation={conversation}
            onOpenMedia={(attachments, index) => setLightbox({ attachments, index })}
            onClose={() => setMediaOpen(false)}
            className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] lg:static lg:z-auto lg:w-72 lg:max-w-none"
          />
        </>
      )}

      {isGroup && membersOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMembersOpen(false)}
            aria-hidden="true"
          />
          <MemberPanel
            conversation={conversation}
            meId={user?.id}
            typingUserIds={typingUserIds}
            recordingUserIds={recordingUserIds}
            onClose={() => setMembersOpen(false)}
            onSelectMember={(id) => setProfileUserId(id)}
            onConversationUpdated={upsertConversation}
            className="fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] lg:static lg:z-auto lg:w-72 lg:max-w-none"
          />
        </>
      )}

      <ProfileDialog
        open={profileUserId !== null}
        onOpenChange={(open) => {
          if (!open) setProfileUserId(null)
        }}
        userId={profileUserId}
      />

      <ForwardDialog
        open={forwardTarget !== null}
        onOpenChange={(open) => {
          if (!open) setForwardTarget(null)
        }}
        message={forwardTarget}
        conversations={conversations}
        meId={user?.id}
        onForwarded={handleForwarded}
      />

      <MessageInfoDialog
        open={infoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setInfoTarget(null)
        }}
        message={infoTarget}
      />
    </div>
  )
}

/** Builds the `replyTo` snapshot the UI shows while a send is in flight. */
function toReply(message: ChatMessage): MessageReply {
  return {
    id: message.id,
    content: message.content,
    type: message.type,
    attachments: message.attachments,
    sender: message.sender,
  }
}
