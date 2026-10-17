/**
 * A tiny in-browser stand-in for the Chatrix REST API.
 *
 * It implements exactly the endpoints the UI calls, returning the same
 * response bodies documented in API_EXAMPLES.md. Swap it out by setting
 * `VITE_USE_MOCK=false`.
 */
import type {
  Attachment,
  Conversation,
  MediaFilter,
  Message,
  MessageType,
  PaginatedMessages,
  PublicUser,
  UserSummary,
} from '@/types/api'
import {
  checkUploadConstraints,
  confirmedAttachment,
  type SignUploadInput,
} from '@/lib/media'
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
 * Pending `POST /uploads/sign` records. The real flow PUTs the bytes to a
 * presigned R2 URL the browser never sees here, so in mock mode the file rides
 * along on the sign request (see `signUpload` in `@/lib/uploads`) and the
 * `confirm` step turns it into a data URL.
 */
type PendingUpload = {
  input: SignUploadInput
  file?: File
  /** Set once confirmed; repeat confirms return it unchanged (idempotent). */
  result?: { attachment?: Attachment; user?: PublicUser; conversation?: Conversation }
  status?: number
}
const pendingUploads = new Map<string, PendingUpload>()

/** Object key convention, mirroring `buildUploadKey` on the backend. */
function mockUploadKey(input: SignUploadInput, userId: string, uploadId: string): string {
  const ext = extensionForMime(input.mimeType)
  if (input.scope === 'avatar') return `avatars/${userId}/${uploadId}${ext}`
  if (input.scope === 'group-icon') {
    return `conversations/${input.conversationId}/icon/${uploadId}${ext}`
  }
  return `messages/${input.conversationId}/${userId}/${uploadId}${ext}`
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'audio/aac': '.aac',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/json': '.json',
}

function extensionForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? ''
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
  store.incrementUnread(input.conversationId)
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

/**
 * Delivers a reply as a **direct message to the quoted message's author**
 * instead of to the open conversation (`replyPrivately`). Finds or creates the
 * DM, so the caller gets `conversation` back only when one had to be created —
 * matching the real API, which also emits `conversation:new` in that case.
 */
export function createPrivateReply(input: {
  sourceConversationId: string
  replyToId: string
  content?: string
  type?: MessageType
  attachments?: Attachment[]
}): { message: Message; conversation?: Conversation } {
  const source = store.findConversation(input.sourceConversationId)
  if (!source) throw new MockError(404, 'Conversation not found.')
  const list = store.getState().messages[input.sourceConversationId] ?? []
  const quoted = list.find((m) => m.id === input.replyToId)
  if (!quoted) throw new MockError(400, 'The quoted message is not in this conversation.')
  if (quoted.sender.id === store.currentUser().id) {
    throw new MockError(400, 'You cannot reply privately to your own message.')
  }

  const { conversation, created } = store.createConversation({
    type: 'direct',
    name: null,
    participantIds: [quoted.sender.id],
  })
  const attachments = input.attachments ?? []
  const message: Message = {
    id: store.nextMessageId(),
    conversationId: conversation.id,
    content: input.content ?? '',
    type: input.type ?? (attachments[0]?.type ?? 'text'),
    attachments,
    sender: store.toParticipant(store.currentUser().id),
    replyTo: store.toReplySnapshot(quoted),
    status: 'sent',
    editedAt: null,
    forwarded: false,
    createdAt: new Date().toISOString(),
  }
  store.appendMessage(message)
  scheduleAutoReply(conversation.id, message)
  return { message, conversation: created ? conversation : undefined }
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

    const messageInfoMatch = pathname.match(/^\/conversations\/([^/]+)\/messages\/([^/]+)\/info$/)
    if (messageInfoMatch) {
      const result = store.messageInfo(
        decodeURIComponent(messageInfoMatch[1]),
        decodeURIComponent(messageInfoMatch[2]),
      )
      if (!result.ok) throw new MockError(result.status, result.error)
      return { data: { info: result.info } as T, status: 200 }
    }

    // `GET /conversations/:id/media` — attachments/links, filtered and paginated.
    const mediaMatch = pathname.match(/^\/conversations\/([^/]+)\/media$/)
    if (mediaMatch) {
      const filter = String(params.type ?? searchParams.get('type') ?? 'all') as MediaFilter
      const limit = Number(params.limit ?? searchParams.get('limit') ?? 30)
      const cursor = (params.cursor as string | undefined) ?? searchParams.get('cursor')
      const data = store.conversationMedia(
        decodeURIComponent(mediaMatch[1]),
        filter,
        cursor ?? null,
        Number.isFinite(limit) ? limit : 30,
      )
      return { data: data as T, status: 200 }
    }

    // `GET /messages/search` — spans every conversation the caller belongs to.
    if (pathname === '/messages/search') {
      const q = String(params.q ?? searchParams.get('q') ?? '')
      const limit = Number(params.limit ?? searchParams.get('limit') ?? 20)
      const cursor = (params.cursor as string | undefined) ?? searchParams.get('cursor')
      const data = store.searchMessages(q, cursor ?? null, Number.isFinite(limit) ? limit : 20)
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

    // `POST /uploads/sign` — step 1 of the direct-to-R2 flow: validate the
    // request (scope, membership, MIME, size) and hand back a presigned PUT.
    if (pathname === '/uploads/sign') {
      const input = (body ?? {}) as SignUploadInput & { file?: File }
      const issues: RegistrationIssue[] = []
      if (!['message', 'avatar', 'group-icon'].includes(input.scope)) {
        issues.push({
          code: 'invalid_enum',
          path: ['scope'],
          message: 'Must be one of: message, avatar, group-icon',
        })
      }
      if (!input.name?.trim()) {
        issues.push({ code: 'too_small', path: ['name'], message: 'Required' })
      }
      if (!input.mimeType?.trim()) {
        issues.push({ code: 'too_small', path: ['mimeType'], message: 'Required' })
      }
      if (!Number.isInteger(input.size) || input.size <= 0) {
        issues.push({ code: 'invalid_type', path: ['size'], message: 'Must be a positive integer' })
      }
      if (issues.length > 0) throw new MockError(400, 'Validation failed', issues)

      if (input.scope === 'avatar' && input.conversationId) {
        throw new MockError(400, 'conversationId is not allowed for avatar uploads')
      }
      if (input.scope !== 'avatar' && !input.conversationId) {
        throw new MockError(400, 'conversationId is required for this upload')
      }

      let conversation: Conversation | undefined
      if (input.scope !== 'avatar') {
        conversation = store.findConversation(input.conversationId as string)
        const isMember = conversation?.participants.some((p) => p.id === store.currentUser().id)
        if (!conversation || !isMember) throw new MockError(404, 'Conversation not found')
        if (input.scope === 'group-icon' && conversation.type !== 'group') {
          throw new MockError(400, 'Only group conversations can have an icon')
        }
      }

      const violation = checkUploadConstraints(input)
      if (violation) throw new MockError(violation.status, violation.message)

      const uploadId = crypto.randomUUID()
      pendingUploads.set(uploadId, { input, file: input.file })
      return {
        data: {
          upload: {
            id: uploadId,
            key: mockUploadKey(input, store.currentUser().id, uploadId),
            // No bucket in the browser: the uploader skips non-http PUT targets.
            url: `mock://uploads/${uploadId}`,
            method: 'PUT',
            headers: { 'Content-Type': input.mimeType },
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
        } as T,
        status: 201,
      }
    }

    // `POST /uploads/:uploadId/confirm` — step 3: the bytes "landed", so answer
    // with the attachment / updated user / updated conversation. Idempotent.
    const uploadConfirmMatch = pathname.match(/^\/uploads\/([^/]+)\/confirm$/)
    if (uploadConfirmMatch) {
      const uploadId = decodeURIComponent(uploadConfirmMatch[1])
      const record = pendingUploads.get(uploadId)
      if (!record) throw new MockError(404, 'Upload not found')
      if (record.result) return { data: record.result as T, status: record.status ?? 200 }

      // The mock PUT is skipped, so a sign without a file mirrors the backend's
      // "the object never landed" rejection (the record survives for a retry).
      if (!record.file) {
        throw new MockError(400, 'No file found for this upload. Upload it to the signed URL first.')
      }
      if (record.file.size !== record.input.size) {
        pendingUploads.delete(uploadId)
        throw new MockError(
          400,
          `Uploaded size (${record.file.size} bytes) does not match the declared size (${record.input.size} bytes)`,
        )
      }

      const url = await readFileAsDataUrl(record.file)
      if (record.input.scope === 'message') {
        const attachment = confirmedAttachment(record.input, url)
        record.result = { attachment }
        record.status = 201
        return { data: { attachment } as T, status: 201 }
      }
      if (record.input.scope === 'avatar') {
        store.setCurrentUser({ ...store.currentUser(), avatarUrl: url })
        record.result = { user: store.currentUser() }
        record.status = 200
        return { data: { user: store.currentUser() } as T, status: 200 }
      }
      const conversation = store.setConversationAvatar(
        record.input.conversationId as string,
        url,
      )
      if (!conversation) throw new MockError(404, 'Group not found')
      record.result = { conversation }
      record.status = 200
      return { data: { conversation } as T, status: 200 }
    }

    const messagesMatch = pathname.match(/^\/conversations\/([^/]+)\/messages$/)
    if (messagesMatch) {
      const input = (body ?? {}) as {
        content?: string
        type?: MessageType
        attachments?: Attachment[]
        replyToId?: string
        replyPrivately?: boolean
      }
      // Mirrors `sendMessageSchema`: text or at least one attachment, else 400.
      if (!input.content?.trim() && !input.attachments?.length) {
        throw new MockError(400, 'Message must have content or attachments')
      }
      const conversationId = decodeURIComponent(messagesMatch[1])
      if (input.replyPrivately) {
        if (!input.replyToId) throw new MockError(400, 'A reply target is required.')
        const result = createPrivateReply({
          sourceConversationId: conversationId,
          replyToId: input.replyToId,
          content: input.content,
          type: input.type,
          attachments: input.attachments,
        })
        return { data: result as T, status: 201 }
      }
      const message = createOutgoingMessage({
        conversationId,
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
      // Partial update: only recognised fields apply, and at least one is required
      // (the backend's zod schema strips unknown keys then rejects an empty patch).
      const patch = (body ?? {}) as Partial<PublicUser['settings']>
      const fields = Object.fromEntries(
        Object.entries(patch).filter(([key]) =>
          ['theme', 'notifications', 'readReceipts'].includes(key),
        ),
      )
      if (Object.keys(fields).length === 0) {
        throw new MockError(400, 'Validation failed', [
          { code: 'custom', path: [], message: 'No settings to update' },
        ])
      }
      const theme = fields.theme
      if (typeof theme === 'string' && !['light', 'dark', 'system'].includes(theme)) {
        throw new MockError(400, 'Validation failed', [
          {
            code: 'invalid_enum',
            path: ['theme'],
            message: 'Must be one of: light, dark, system',
          },
        ])
      }
      store.setCurrentUser({
        ...store.currentUser(),
        settings: { ...store.currentUser().settings, ...fields },
      })
      return { data: { settings: store.currentUser().settings } as T, status: 200 }
    }

    // `PATCH /conversations/:id/messages/:messageId` — edit own text message.
    const messageEditMatch = pathname.match(/^\/conversations\/([^/]+)\/messages\/([^/]+)$/)
    if (messageEditMatch) {
      const content = (body as { content?: string })?.content ?? ''
      const result = store.editMessage(
        decodeURIComponent(messageEditMatch[1]),
        decodeURIComponent(messageEditMatch[2]),
        content,
      )
      if (!result.ok) throw new MockError(result.status, result.error)
      return { data: { message: result.message } as T, status: 200 }
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

    // Remove a group member ("kick") — owner only.
    const kickMatch = pathname.match(/^\/conversations\/([^/]+)\/participants\/([^/]+)$/)
    if (kickMatch) {
      const conversation = store.findConversation(decodeURIComponent(kickMatch[1]))
      if (!conversation) throw new MockError(404, 'Conversation not found.')
      if (conversation.type !== 'group') {
        throw new MockError(400, 'You can only remove members from a group')
      }
      const me = store.currentUser().id
      if (conversation.ownerId !== me) {
        throw new MockError(403, 'Only the group owner can remove members')
      }
      const participantId = decodeURIComponent(kickMatch[2])
      if (participantId === conversation.ownerId) {
        throw new MockError(400, 'The group owner cannot be removed')
      }
      if (!conversation.participants.some((p) => p.id === participantId)) {
        throw new MockError(400, 'That person is not a member of this group')
      }
      const updated = store.removeConversationParticipant(conversation.id, participantId)
      if (!updated) throw new MockError(404, 'Conversation not found.')
      return { data: { conversation: updated } as T, status: 200 }
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
