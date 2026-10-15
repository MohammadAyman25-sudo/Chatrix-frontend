/**
 * A tiny in-browser stand-in for the Chatrix REST API.
 *
 * It implements exactly the endpoints the UI calls, returning the same
 * response bodies documented in API_EXAMPLES.md. Swap it out by setting
 * `VITE_USE_MOCK=false`.
 */
import type {
  Attachment,
  Message,
  MessageType,
  PaginatedMessages,
  PublicUser,
  UserSummary,
} from '@/types/api'
import { attachmentType } from '@/lib/media'
import {
  isCompromisedPassword,
  validateRegistration,
  type RegistrationIssue,
} from '@/lib/password'
import { MOCK_EMAIL_VERIFICATION } from './config'
import * as store from './data'

type MockResponse<T> = { data: T; status: number }
type RequestConfig = { params?: Record<string, unknown>; signal?: AbortSignal }

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

class MockError extends Error {
  response: { status: number; data: { message: string; issues?: RegistrationIssue[] } }
  constructor(status: number, message: string, issues?: RegistrationIssue[]) {
    super(message)
    this.response = { status, data: issues ? { message, issues } : { message } }
  }
}

function toSummary(user: PublicUser): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
  }
}

function encodeCursor(id: string): string {
  return btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeCursor(cursor: string): string {
  const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(base64)
  } catch {
    return ''
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Mirrors the backend printing verification emails to the server console when
 * no mail provider is configured — here the "console" is the browser.
 */
function issueVerification(email: string): string {
  const token = `mock_${Math.random().toString(36).slice(2, 10)}`
  store.setVerificationToken(token)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5174'
  console.info(`[Chatrix mock] Verification link for ${email}: ${origin}/verify-email?token=${token}`)
  return token
}

async function guard(signal?: AbortSignal) {
  await delay()
  if (signal?.aborted) {
    const error = new Error('Canceled')
    error.name = 'CanceledError'
    throw error
  }
}

function paginateMessages(
  conversationId: string,
  cursor: string | null,
  limit: number,
): PaginatedMessages {
  const all = store.getState().messages[conversationId] ?? []
  const descending = [...all].reverse()

  let start = 0
  if (cursor) {
    const cursorId = decodeCursor(cursor)
    const index = descending.findIndex((m) => m.id === cursorId)
    start = index === -1 ? 0 : index + 1
  }

  const page = descending.slice(start, start + limit)
  const hasMore = start + limit < descending.length
  const oldest = page[page.length - 1]
  return {
    items: page,
    hasMore,
    nextCursor: hasMore && oldest ? encodeCursor(oldest.id) : null,
  }
}

/* ----------------------- simulated incoming messages ----------------------- */

export type OutgoingMessageInput = {
  conversationId: string
  content?: string
  type?: MessageType
  attachments?: Attachment[]
  replyToId?: string
}

function buildIncoming(input: OutgoingMessageInput, senderId: string): Message {
  const attachments = input.attachments ?? []
  const list = store.getState().messages[input.conversationId] ?? []
  const target = input.replyToId ? list.find((m) => m.id === input.replyToId) : undefined
  const message: Message = {
    id: store.nextMessageId(),
    conversationId: input.conversationId,
    content: input.content ?? '',
    type: input.type ?? (attachments[0]?.type ?? 'text'),
    attachments,
    sender: store.toParticipant(senderId),
    replyTo: target ? store.toReplySnapshot(target) : null,
    status: 'delivered',
    editedAt: null,
    forwarded: false,
    createdAt: new Date().toISOString(),
  }
  store.appendMessage(message)
  return message
}

function replyText(type: Message['type']): string {
  switch (type) {
    case 'image':
      return 'Love this photo'
    case 'video':
      return 'That clip is great'
    case 'document':
      return 'Thanks, I will read through it'
    default: {
      const canned = [
        'Got it',
        'Makes sense!',
        'Nice, thanks for the update.',
        'Ha, good one.',
        'I will take a look in a bit.',
        'Totally agree.',
        'Understood.',
      ]
      return canned[Math.floor(Math.random() * canned.length)]
    }
  }
}

const MOCK_VOICE_REPLY: Attachment = {
  type: 'audio',
  name: 'voice-note.mp3',
  mimeType: 'audio/mpeg',
  size: 96_400,
  duration: 6,
  url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
}

let autoReplyEnabled = true

export function setAutoReply(enabled: boolean) {
  autoReplyEnabled = enabled
}

function scheduleAutoReply(conversationId: string, incoming: Message) {
  if (!autoReplyEnabled) return
  const conversation = store.findConversation(conversationId)
  if (!conversation) return

  const others = conversation.participants.filter((p) => p.id !== store.currentUser().id)
  if (others.length === 0) return
  const responder = others[Math.floor(Math.random() * others.length)]

  // A voice note gets a voice note back, and shows the recording indicator.
  if (incoming.type === 'audio') {
    window.setTimeout(() => {
      store.bus.emit('recording:update', {
        conversationId,
        userId: responder.id,
        isRecording: true,
      })
    }, 600)
    window.setTimeout(() => {
      store.bus.emit('recording:update', {
        conversationId,
        userId: responder.id,
        isRecording: false,
      })
      store.bus.emit(
        'message:new',
        buildIncoming(
          { conversationId, content: '', type: 'audio', attachments: [MOCK_VOICE_REPLY] },
          responder.id,
        ),
      )
    }, 2400)
    return
  }

  const reply = replyText(incoming.type)

  window.setTimeout(() => {
    store.bus.emit('typing:update', { conversationId, userId: responder.id, isTyping: true })
  }, 600)

  window.setTimeout(() => {
    store.bus.emit('typing:update', { conversationId, userId: responder.id, isTyping: false })
    store.bus.emit(
      'message:new',
      buildIncoming({ conversationId, content: reply, replyToId: incoming.id }, responder.id),
    )
  }, 1900)
}

/* --------------------------------- routes --------------------------------- */

/** Shared by REST `POST .../messages` and the mock `message:send` socket event. */
export function createOutgoingMessage(input: OutgoingMessageInput): Message {
  const attachments = input.attachments ?? []
  const list = store.getState().messages[input.conversationId] ?? []
  const target = input.replyToId ? list.find((m) => m.id === input.replyToId) : undefined
  const message: Message = {
    id: store.nextMessageId(),
    conversationId: input.conversationId,
    content: input.content ?? '',
    type: input.type ?? (attachments[0]?.type ?? 'text'),
    attachments,
    sender: store.toParticipant(store.currentUser().id),
    replyTo: target ? store.toReplySnapshot(target) : null,
    status: 'sent',
    editedAt: null,
    forwarded: false,
    createdAt: new Date().toISOString(),
  }
  store.appendMessage(message)
  scheduleAutoReply(input.conversationId, message)
  return message
}

export const mockApi = {
  async get<T>(url: string, config: RequestConfig = {}): Promise<MockResponse<T>> {
    await guard(config.signal)
    const { pathname, searchParams } = new URL(url, 'http://mock.local')
    const params = config.params ?? {}

    if (pathname === '/auth/me') {
      return { data: { user: store.currentUser() } as T, status: 200 }
    }

    if (pathname === '/users/me/settings') {
      return { data: { settings: store.currentUser().settings } as T, status: 200 }
    }

    if (pathname === '/conversations') {
      return { data: { items: store.getState().conversations } as T, status: 200 }
    }

    const presenceMatch = pathname.match(/^\/conversations\/([^/]+)\/presence$/)
    if (presenceMatch) {
      const id = decodeURIComponent(presenceMatch[1])
      return { data: { items: store.conversationPresence(id) } as T, status: 200 }
    }

    const messagesMatch = pathname.match(/^\/conversations\/([^/]+)\/messages$/)
    if (messagesMatch) {
      const limit = Number(params.limit ?? searchParams.get('limit') ?? 30)
      const cursor = (params.cursor as string | undefined) ?? searchParams.get('cursor')
      const data = paginateMessages(
        decodeURIComponent(messagesMatch[1]),
        cursor ?? null,
        Number.isFinite(limit) ? limit : 30,
      )
      return { data: data as T, status: 200 }
    }

    if (pathname === '/users/search') {
      const q = String(params.q ?? searchParams.get('q') ?? '')
        .trim()
        .toLowerCase()
      const limit = Number(params.limit ?? searchParams.get('limit') ?? 20)
      const me = store.currentUser().id
      const data = store.MOCK_USERS.filter(
        (u) =>
          u.id !== me &&
          (q === '' ||
            u.username.toLowerCase().includes(q) ||
            (u.displayName ?? '').toLowerCase().includes(q)),
      )
        .slice(0, Number.isFinite(limit) ? limit : 20)
        .map(toSummary)
      return { data: data as T, status: 200 }
    }

    const userMatch = pathname.match(/^\/users\/([^/]+)$/)
    if (userMatch) {
      const id = decodeURIComponent(userMatch[1])
      const found = store.MOCK_USERS.find((u) => u.id === id)
      if (!found) throw new MockError(404, 'User not found')
      return { data: { user: toSummary(found) } as T, status: 200 }
    }

    throw new MockError(404, `No mock handler for GET ${pathname}`)
  },

  async post<T>(url: string, body?: unknown): Promise<MockResponse<T>> {
    await delay()
    const { pathname } = new URL(url, 'http://mock.local')

    if (pathname === '/auth/login') {
      const email = (body as { email?: string })?.email ?? ''
      const matched = store.MOCK_USERS.find((u) => u.email === email) ?? store.MOCK_ME
      const current = store.currentUser()
      const user: PublicUser =
        MOCK_EMAIL_VERIFICATION && current.email === matched.email
          ? { ...matched, emailVerified: current.emailVerified }
          : matched
      if (MOCK_EMAIL_VERIFICATION && user.emailVerified === false) {
        throw new MockError(403, 'Email not verified. Check your inbox for the verification link.')
      }
      store.setCurrentUser(user)
      return { data: { user } as T, status: 200 }
    }

    if (pathname === '/auth/register') {
      const input = (body ?? {}) as {
        username?: string
        email?: string
        password?: string
        confirmPassword?: string
      }
      const issues = validateRegistration(input)
      if (issues.length > 0) throw new MockError(400, 'Validation failed', issues)
      if (isCompromisedPassword(input.password ?? '')) {
        throw new MockError(
          400,
          'This password has appeared in a data breach. Please choose a different password.',
        )
      }
      if (MOCK_EMAIL_VERIFICATION) {
        const pending: PublicUser = {
          ...store.currentUser(),
          email: input.email?.trim() || store.currentUser().email,
          emailVerified: false,
        }
        store.setCurrentUser(pending)
        issueVerification(pending.email)
        return { data: { user: pending, emailVerificationSent: true } as T, status: 201 }
      }
      // The demo keeps a single seeded identity so the seeded conversations stay valid.
      return { data: { user: store.currentUser() } as T, status: 201 }
    }

    if (pathname === '/auth/verify-email') {
      const token = (body as { token?: string })?.token
      if (!token) throw new MockError(400, 'A verification token is required.')
      const verified: PublicUser = { ...store.currentUser(), emailVerified: true }
      store.setCurrentUser(verified)
      return { data: { user: verified } as T, status: 200 }
    }

    if (pathname === '/auth/resend-verification') {
      const email = (body as { email?: string })?.email || store.currentUser().email
      issueVerification(email)
      return {
        data: {
          message: 'If that address has an unverified account, a verification email was sent.',
        } as T,
        status: 202,
      }
    }

    if (pathname === '/auth/logout' || pathname === '/auth/refresh') {
      return { data: undefined as T, status: 204 }
    }

    if (pathname === '/users/me/avatar') {
      if (!(body instanceof FormData)) throw new MockError(400, 'Expected multipart/form-data')
      const file = body.get('avatar')
      if (!(file instanceof File)) throw new MockError(400, 'No avatar was uploaded.')
      store.setCurrentUser({ ...store.currentUser(), avatarUrl: await readFileAsDataUrl(file) })
      return { data: { user: store.currentUser() } as T, status: 200 }
    }

    if (pathname === '/conversations') {
      const input = body as {
        type: 'direct' | 'group'
        name?: string
        participantIds: string[]
      }
      const { conversation, created } = store.createConversation({
        type: input.type,
        name: input.type === 'group' ? input.name?.trim() || 'New group' : null,
        participantIds: input.participantIds ?? [],
      })
      return { data: { conversation } as T, status: created ? 201 : 200 }
    }

    const groupAvatarMatch = pathname.match(/^\/conversations\/([^/]+)\/avatar$/)
    if (groupAvatarMatch) {
      if (!(body instanceof FormData)) throw new MockError(400, 'Expected multipart/form-data')
      const file = body.get('avatar')
      if (!(file instanceof File)) throw new MockError(400, 'No icon was uploaded.')
      const conversation = store.setConversationAvatar(
        decodeURIComponent(groupAvatarMatch[1]),
        await readFileAsDataUrl(file),
      )
      if (!conversation) throw new MockError(404, 'Group not found.')
      return { data: { conversation } as T, status: 200 }
    }

    const participantsMatch = pathname.match(/^\/conversations\/([^/]+)\/participants$/)
    if (participantsMatch) {
      const participantIds = (body as { participantIds?: string[] })?.participantIds ?? []
      const result = store.addConversationParticipants(
        decodeURIComponent(participantsMatch[1]),
        participantIds,
      )
      if (!result) throw new MockError(404, 'Group not found.')
      if (result.added.length === 0) {
        throw new MockError(400, 'Everyone you selected is already in this group.')
      }
      return { data: { conversation: result.conversation } as T, status: 200 }
    }

    const attachmentsMatch = pathname.match(/^\/conversations\/([^/]+)\/attachments$/)
    if (attachmentsMatch) {
      if (!(body instanceof FormData)) throw new MockError(400, 'Expected multipart/form-data')
      const files = body.getAll('files').filter((entry): entry is File => entry instanceof File)
      if (files.length === 0) throw new MockError(400, 'No files were uploaded.')
      const durationValue = Number(body.get('duration'))
      const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : undefined
      const attachments: Attachment[] = []
      for (const file of files) {
        const type = attachmentType(file.type, file.name)
        attachments.push({
          type,
          url: await readFileAsDataUrl(file),
          name: file.name || 'Untitled',
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          ...(type === 'audio' && duration ? { duration } : {}),
        })
      }
      return { data: { attachments } as T, status: 201 }
    }

    const messagesMatch = pathname.match(/^\/conversations\/([^/]+)\/messages$/)
    if (messagesMatch) {
      const input = (body ?? {}) as {
        content?: string
        type?: MessageType
        attachments?: Attachment[]
        replyToId?: string
      }
      const message = createOutgoingMessage({
        conversationId: decodeURIComponent(messagesMatch[1]),
        content: input.content ?? '',
        type: input.type,
        attachments: input.attachments,
        replyToId: input.replyToId,
      })
      return { data: { message } as T, status: 201 }
    }

    const forwardMatch = pathname.match(/^\/conversations\/([^/]+)\/messages\/([^/]+)\/forward$/)
    if (forwardMatch) {
      const input = (body ?? {}) as { conversationIds?: string[]; userIds?: string[] }
      const conversationIds = input.conversationIds ?? []
      const userIds = input.userIds ?? []
      if (conversationIds.length === 0 && userIds.length === 0) {
        throw new MockError(400, 'Choose at least one chat or person to forward to.')
      }
      if (userIds.includes(store.currentUser().id)) {
        throw new MockError(400, 'You cannot forward a message to yourself.')
      }
      const result = store.forwardMessage({
        sourceConversationId: decodeURIComponent(forwardMatch[1]),
        messageId: decodeURIComponent(forwardMatch[2]),
        conversationIds,
        userIds,
      })
      if (!result) throw new MockError(404, 'Message not found.')
      return { data: result as T, status: 201 }
    }

    throw new MockError(404, `No mock handler for POST ${pathname}`)
  },

  async patch<T>(url: string, body?: unknown): Promise<MockResponse<T>> {
    await delay()
    const { pathname } = new URL(url, 'http://mock.local')

    if (pathname === '/users/me') {
      const patch = body as Partial<PublicUser>
      store.setCurrentUser({ ...store.currentUser(), ...patch })
      return { data: { user: store.currentUser() } as T, status: 200 }
    }

    if (pathname === '/users/me/settings') {
      const patch = body as Partial<PublicUser['settings']>
      store.setCurrentUser({
        ...store.currentUser(),
        settings: { ...store.currentUser().settings, ...patch },
      })
      return { data: { settings: store.currentUser().settings } as T, status: 200 }
    }

    const conversationMatch = pathname.match(/^\/conversations\/([^/]+)$/)
    if (conversationMatch) {
      const name = (body as { name?: string })?.name?.trim()
      if (!name) throw new MockError(400, 'Group name is required.')
      const conversation = store.renameConversation(decodeURIComponent(conversationMatch[1]), name)
      if (!conversation) throw new MockError(404, 'Group not found.')
      return { data: { conversation } as T, status: 200 }
    }

    throw new MockError(404, `No mock handler for PATCH ${pathname}`)
  },

  async delete<T>(url: string): Promise<MockResponse<T>> {
    await delay()
    const { pathname } = new URL(url, 'http://mock.local')

    if (pathname === '/users/me/avatar') {
      store.setCurrentUser({ ...store.currentUser(), avatarUrl: null })
      return { data: { user: store.currentUser() } as T, status: 200 }
    }

    const groupAvatarMatch = pathname.match(/^\/conversations\/([^/]+)\/avatar$/)
    if (groupAvatarMatch) {
      const conversation = store.setConversationAvatar(decodeURIComponent(groupAvatarMatch[1]), null)
      if (!conversation) throw new MockError(404, 'Group not found.')
      return { data: { conversation } as T, status: 200 }
    }

    throw new MockError(404, `No mock handler for DELETE ${pathname}`)
  },
}

/**
 * In mock mode with verification enabled, the "emailed" link is surfaced so the
 * flow is demoable without a mail provider. Returns `null` otherwise.
 */
export function mockVerificationHref(): string | null {
  if (!MOCK_EMAIL_VERIFICATION) return null
  const token = store.getVerificationToken()
  return token ? `/verify-email?token=${encodeURIComponent(token)}` : null
}
