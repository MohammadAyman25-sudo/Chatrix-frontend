/**
 * A stand-in for the Socket.IO client used in mock mode.
 *
 * Server -> client events are sourced from the mock `bus` so the simulated
 * replies and typing indicators behave like the real broadcast.
 */
import type { AppSocket, SocketHandler } from '@/lib/app-socket'
import type { Conversation, Message, MessageType, Attachment } from '@/types/api'
import { createOutgoingMessage } from './client'
import { bus, currentUser, forwardMessage, getPresence, setPresence } from './data'

const FORWARDED_EVENTS = [
  'message:new',
  'conversation:new',
  'conversation:updated',
  'typing:update',
  'recording:update',
  'message:status',
  'presence:update',
] as const

export function createMockSocket(): AppSocket {
  const listeners = new Map<string, Set<SocketHandler>>()
  const disposers: Array<() => void> = []

  const dispatch = (event: string, payload: unknown) => {
    for (const handler of listeners.get(event) ?? []) handler(payload)
  }

  for (const event of FORWARDED_EVENTS) {
    disposers.push(bus.on(event, (payload) => dispatch(event, payload)))
  }

  // Simulate contacts drifting between online/offline so presence feels live.
  const demoUserIds = ['u_maya', 'u_diego', 'u_priya', 'u_sam', 'u_kofi']
  let step = 0
  const presenceTimer = window.setInterval(() => {
    const userId = demoUserIds[step % demoUserIds.length]
    step += 1
    const current = getPresence(userId)
    const next =
      current.status === 'online'
        ? { status: 'offline' as const, lastSeenAt: new Date().toISOString() }
        : { status: 'online' as const, lastSeenAt: null }
    setPresence(userId, next.status, next.lastSeenAt)
    bus.emit('presence:update', { userId, status: next.status, lastSeenAt: next.lastSeenAt })
  }, 20_000)

  const socket: AppSocket = {
    on(event, handler) {
      const set = listeners.get(event) ?? new Set<SocketHandler>()
      set.add(handler)
      listeners.set(event, set)
      return socket
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
      return socket
    },
    emit(event, ...args) {
      if (event === 'message:send') {
        const payload = args[0] as {
          conversationId?: string
          content?: string
          type?: MessageType
          attachments?: Attachment[]
          replyToId?: string
        }
        const ack = args[1] as
          | ((res: { ok?: boolean; message?: Message; error?: string }) => void)
          | undefined
        window.setTimeout(() => {
          const hasContent = Boolean(payload?.content?.trim())
          const hasAttachments = Boolean(payload?.attachments?.length)
          if (!payload?.conversationId || (!hasContent && !hasAttachments)) {
            ack?.({ ok: false, error: 'Invalid payload' })
            return
          }
          ack?.({
            ok: true,
            message: createOutgoingMessage({
              conversationId: payload.conversationId,
              content: payload.content,
              type: payload.type,
              attachments: payload.attachments,
              replyToId: payload.replyToId,
            }),
          })
        }, 120)
      }
      if (event === 'message:forward') {
        const payload = args[0] as {
          conversationId?: string
          messageId?: string
          conversationIds?: string[]
          userIds?: string[]
        }
        const ack = args[1] as
          | ((res: {
              ok?: boolean
              messages?: Message[]
              conversations?: Conversation[]
              error?: string
            }) => void)
          | undefined
        window.setTimeout(() => {
          if (!payload?.conversationId || !payload?.messageId) {
            ack?.({ ok: false, error: 'Invalid payload' })
            return
          }
          const conversationIds = payload.conversationIds ?? []
          const userIds = payload.userIds ?? []
          if (conversationIds.length === 0 && userIds.length === 0) {
            ack?.({ ok: false, error: 'Choose at least one chat or person to forward to' })
            return
          }
          if (userIds.includes(currentUser().id)) {
            ack?.({ ok: false, error: 'You cannot forward a message to yourself' })
            return
          }
          const result = forwardMessage({
            sourceConversationId: payload.conversationId,
            messageId: payload.messageId,
            conversationIds,
            userIds,
          })
          if (!result) {
            ack?.({ ok: false, error: 'Message not found' })
            return
          }
          ack?.({ ok: true, messages: result.messages, conversations: result.conversations })
        }, 120)
      }
      // typing:start / typing:stop / recording:start / recording:stop /
      // message:read are intentionally no-ops here.
      return socket
    },
    disconnect() {
      window.clearInterval(presenceTimer)
      for (const dispose of disposers) dispose()
      disposers.length = 0
      listeners.clear()
    },
  }

  return socket
}
