/**
 * In-memory (localStorage-backed) data for the dummy chat.
 *
 * Enabled with `VITE_USE_MOCK=true` (see `.env.development`). It mirrors the
 * shapes documented in API_EXAMPLES.md so the real API can be dropped back in
 * by flipping the flag off.
 */
import type {
  Attachment,
  Conversation,
  MediaFilter,
  Message,
  MessageInfo,
  MessageInfoEntry,
  MessageMediaItem,
  MessageReply,
  MessageSearchHit,
  Participant,
  PublicUser,
} from '@/types/api'
import { EDIT_WINDOW_MS } from '@/lib/messages'

export const MOCK_STORAGE_KEY = 'chatrix-mock-state-v5'

const now = Date.now()
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
const daysAgo = (days: number, minutesAgo = 0) =>
  new Date(now - days * 86_400_000 - minutesAgo * 60_000).toISOString()

const avatar = (id: string) => `https://i.pravatar.cc/240?u=${encodeURIComponent(id)}`

function user(
  id: string,
  username: string,
  displayName: string,
  bio: string,
): PublicUser {
  return {
    id,
    username,
    displayName,
    email: `${username}@chatrix.dev`,
    emailVerified: true,
    bio,
    avatarUrl: avatar(id),
    settings: { theme: 'system', notifications: true, readReceipts: true },
    createdAt: daysAgo(120),
  }
}

export const MOCK_USERS: PublicUser[] = [
  user('u_alice', 'alice', 'Alice Nguyen', 'Product designer. Coffee first.'),
  user('u_maya', 'maya', 'Maya Chen', 'Frontend engineer, type nerd.'),
  user('u_diego', 'diego', 'Diego Alvarez', 'Backend & infra.'),
  user('u_priya', 'priya', 'Priya Shah', 'Illustrator & motion.'),
  user('u_sam', 'sam', 'Sam Rivera', 'PM. Spreadsheet enjoyer.'),
  user('u_kofi', 'kofi', 'Kofi Mensah', 'QA and release wrangling.'),
]

export const MOCK_ME = MOCK_USERS[0]

/* -------------------------------- presence -------------------------------- */

/** Presence is ephemeral, so it lives only in memory (never persisted). */
export type MockPresence = {
  userId: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

function seedPresence(): Map<string, MockPresence> {
  return new Map<string, MockPresence>([
    ['u_alice', { userId: 'u_alice', status: 'online', lastSeenAt: null }],
    ['u_maya', { userId: 'u_maya', status: 'online', lastSeenAt: null }],
    ['u_diego', { userId: 'u_diego', status: 'offline', lastSeenAt: at(35) }],
    ['u_priya', { userId: 'u_priya', status: 'online', lastSeenAt: null }],
    ['u_sam', { userId: 'u_sam', status: 'offline', lastSeenAt: at(220) }],
    ['u_kofi', { userId: 'u_kofi', status: 'offline', lastSeenAt: daysAgo(1) }],
  ])
}

let presence = seedPresence()

export function getPresence(userId: string): MockPresence {
  return presence.get(userId) ?? { userId, status: 'offline', lastSeenAt: null }
}

export function setPresence(
  userId: string,
  status: MockPresence['status'],
  lastSeenAt: string | null,
): void {
  presence.set(userId, { userId, status, lastSeenAt })
}

export function conversationPresence(conversationId: string): MockPresence[] {
  const conversation = findConversation(conversationId)
  if (!conversation) return []
  return conversation.participants.map((participant) => getPresence(participant.id))
}

const byId = (id: string) => MOCK_USERS.find((u) => u.id === id)!

export function toParticipant(id: string): Participant {
  const u = byId(id)
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl }
}

/** Seed attachments use stable public demo assets. */
const seedAttachment = {
  image(_id: string, name: string, seed: string): Attachment {
    return {
      type: 'image',
      name,
      mimeType: 'image/jpeg',
      size: 482_133,
      url: `https://picsum.photos/seed/${seed}/1200/800`,
    }
  },
  video(_id: string, name: string): Attachment {
    return {
      type: 'video',
      name,
      mimeType: 'video/mp4',
      size: 2_314_500,
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    }
  },
  audio(_id: string, name: string, duration = 7): Attachment {
    return {
      type: 'audio',
      name,
      mimeType: 'audio/mpeg',
      size: 1_204_000,
      duration,
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    }
  },
  document(_id: string, name: string): Attachment {
    return {
      type: 'document',
      name,
      mimeType: 'application/pdf',
      size: 62_400,
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    }
  },
}

const ME = toParticipant('u_alice')

/** A quoted-message snapshot, matching the `replyTo` object in the API. */
export function toReplySnapshot(message: Message): MessageReply {
  return {
    id: message.id,
    content: message.content,
    type: message.type,
    attachments: message.attachments,
    sender: message.sender,
  }
}

function msg(
  id: string,
  conversationId: string,
  senderId: string,
  content: string,
  createdAt: string,
  status: Message['status'] = 'read',
  replyTo: MessageReply | null = null,
): Message {
  return {
    id,
    conversationId,
    content,
    type: 'text',
    attachments: [],
    sender: toParticipant(senderId),
    replyTo,
    status,
    editedAt: null,
    forwarded: false,
    createdAt,
  }
}

function rich(
  id: string,
  conversationId: string,
  senderId: string,
  text: string,
  attachments: Attachment[],
  createdAt: string,
  status: Message['status'] = 'read',
): Message {
  return {
    id,
    conversationId,
    content: text,
    type: attachments[0]?.type ?? 'document',
    attachments,
    sender: toParticipant(senderId),
    replyTo: null,
    status,
    editedAt: null,
    forwarded: false,
    createdAt,
  }
}

/** Links a seeded reply to its target within the same conversation list. */
function linkReply(list: Message[], messageId: string, replyToId: string) {
  const target = list.find((m) => m.id === messageId)
  const source = list.find((m) => m.id === replyToId)
  if (target && source) target.replyTo = toReplySnapshot(source)
}

export type MockState = {
  user: PublicUser
  conversations: Conversation[]
  /** Oldest → newest, per conversation. */
  messages: Record<string, Message[]>
  /** Last email-verification token "emailed" by the mock (see resend handlers). */
  verificationToken?: string
}

function seedState(): MockState {
  const conversations: Conversation[] = [
    {
      id: 'c_maya',
      type: 'direct',
      name: null,
      avatarUrl: null,
      ownerId: null,
      participants: [ME, toParticipant('u_maya')],
      lastMessageAt: at(2),
      createdAt: daysAgo(9),
      unreadCount: 2,
    },
    {
      id: 'c_design',
      type: 'group',
      name: 'Design Crew',
      avatarUrl: 'https://picsum.photos/seed/chatrix-design-crew/240/240',
      // The signed-in user owns this group, so the kick action is demoable.
      ownerId: ME.id,
      participants: [
        ME,
        toParticipant('u_maya'),
        toParticipant('u_diego'),
        toParticipant('u_priya'),
        toParticipant('u_sam'),
      ],
      lastMessageAt: at(10),
      createdAt: daysAgo(21),
      unreadCount: 5,
    },
    {
      id: 'c_diego',
      type: 'direct',
      name: null,
      avatarUrl: null,
      ownerId: null,
      participants: [ME, toParticipant('u_diego')],
      lastMessageAt: at(150),
      createdAt: daysAgo(14),
      unreadCount: 0,
    },
    {
      id: 'c_trip',
      type: 'group',
      name: 'Weekend Trip',
      avatarUrl: null,
      // Owned by someone else: no kick controls for the signed-in user.
      ownerId: 'u_sam',
      participants: [ME, toParticipant('u_sam'), toParticipant('u_kofi')],
      lastMessageAt: daysAgo(2),
      createdAt: daysAgo(5),
      unreadCount: 1,
    },
  ]

  const messages: Record<string, Message[]> = {
    c_maya: [
      msg('m1', 'c_maya', 'u_maya', 'Hey! Did you get a chance to look at the new chat composer?', at(52)),
      msg('m2', 'c_maya', 'u_alice', 'Just opened it. The layout feels much calmer now.', at(48)),
      rich(
        'm3',
        'c_maya',
        'u_maya',
        'Here is the reference I was talking about 🎨',
        [seedAttachment.image('a1', 'moodboard.jpg', 'chatrix-moodboard')],
        at(40),
      ),
      msg('m4', 'c_maya', 'u_alice', 'Oh that palette is great. Saving it.', at(30)),
      rich(
        'm5',
        'c_maya',
        'u_alice',
        'I recorded a quick voice note about the spacing',
        [seedAttachment.audio('a2', 'spacing-notes.mp3')],
        at(12),
      ),
      msg('m6', 'c_maya', 'u_maya', 'Perfect, listening now 🎧', at(4)),
      msg('m7', 'c_maya', 'u_alice', 'Here is the revised spec: https://chatrix.dev/specs/composer-v2', at(2), 'sent'),
    ],
    c_design: [
      msg('d1', 'c_design', 'u_sam', 'Standup in 10 — agenda is in the doc.', at(180)),
      rich(
        'd2',
        'c_design',
        'u_priya',
        'New icon set is ready for review ✨',
        [seedAttachment.image('a3', 'icon-set.png', 'chatrix-icons')],
        at(120),
      ),
      msg('d3', 'c_design', 'u_diego', 'Nice. Do we ship it behind a flag?', at(90)),
      rich(
        'd4',
        'c_design',
        'u_sam',
        'Here is the spec if anyone needs it',
        [seedAttachment.document('a4', 'chat-spec-v3.pdf')],
        at(60),
      ),
      rich(
        'd5',
        'c_design',
        'u_priya',
        'Quick screen recording of the animation',
        [seedAttachment.video('a5', 'composer-transition.mp4')],
        at(30),
      ),
      msg('d6', 'c_design', 'u_maya', 'That easing is so smooth 😍', at(18)),
      msg('d7', 'c_design', 'u_diego', 'All the docs live at https://chatrix.dev/docs/icons now.', at(10)),
    ],
    c_diego: [
      msg('g1', 'c_diego', 'u_diego', 'Deployed the keyset pagination fix to staging.', at(190)),
      msg('g2', 'c_diego', 'u_alice', 'Nice, I will retest the infinite scroll tomorrow.', at(180)),
      rich(
        'g3',
        'c_diego',
        'u_diego',
        'Attaching the load test results',
        [seedAttachment.document('a6', 'load-test-results.pdf')],
        at(150),
      ),
    ],
    c_trip: [
      msg('t1', 'c_trip', 'u_kofi', 'Cabin is booked! 🏔️', daysAgo(2, 120)),
      rich(
        't2',
        'c_trip',
        'u_sam',
        'The view from the listing',
        [seedAttachment.image('a7', 'cabin.jpg', 'chatrix-cabin')],
        daysAgo(2, 90),
      ),
      msg('t3', 'c_trip', 'u_alice', 'Who is driving? I can take 3 people.', daysAgo(2)),
    ],
  }

  // A few seeded replies so the quoting UI is visible on first load.
  linkReply(messages.c_maya, 'm4', 'm3')
  linkReply(messages.c_maya, 'm6', 'm5')
  linkReply(messages.c_maya, 'm7', 'm3')
  linkReply(messages.c_design, 'd3', 'd2')
  linkReply(messages.c_diego, 'g2', 'g1')

  return { user: MOCK_ME, conversations, messages }
}

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as MockState
    if (!parsed?.conversations?.length || !parsed.messages) return seedState()
    // Always reflect the current mock "session" identity.
    parsed.user = MOCK_USERS.find((u) => u.id === parsed.user?.id) ?? MOCK_ME
    // Older saved states predate `unreadCount`.
    parsed.conversations = parsed.conversations.map((conversation) => ({
      ...conversation,
      unreadCount: conversation.unreadCount ?? 0,
      // Older saved states predate `ownerId`: mirror the backend's fallback to
      // the first participant for groups that were created before ownership.
      ownerId:
        conversation.type === 'group'
          ? (conversation.ownerId ?? conversation.participants[0]?.id ?? null)
          : null,
    }))
    return parsed
  } catch {
    return seedState()
  }
}

let state: MockState = loadState()

export function getState(): MockState {
  return state
}

export function saveState() {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage may be unavailable or full (large data URLs) — mock still works in-memory.
  }
}

export function resetMock() {
  state = seedState()
  presence = seedPresence()
  saveState()
}

export function currentUser(): PublicUser {
  return state.user
}

export function setCurrentUser(user: PublicUser) {
  state.user = user
  saveState()
}

export function getVerificationToken(): string | undefined {
  return state.verificationToken
}

export function setVerificationToken(token: string | undefined) {
  state.verificationToken = token
  saveState()
}

export function findConversation(id: string): Conversation | undefined {
  return state.conversations.find((c) => c.id === id)
}

function sortConversations() {
  state.conversations.sort((a, b) => {
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0
    return bTime - aTime
  })
}

export function appendMessage(message: Message) {
  const list = state.messages[message.conversationId] ?? []
  list.push(message)
  state.messages[message.conversationId] = list

  const conversation = findConversation(message.conversationId)
  if (conversation) {
    conversation.lastMessageAt = message.createdAt
  }
  sortConversations()
  saveState()
}

/**
 * Bump a conversation's unread badge for a message addressed to the current
 * user (used for simulated incoming messages — own messages never count).
 */
export function incrementUnread(conversationId: string) {
  const conversation = findConversation(conversationId)
  if (!conversation) return
  conversation.unreadCount = (conversation.unreadCount ?? 0) + 1
  saveState()
}

/** Clear a conversation's unread badge (`message:read`). */
export function markConversationRead(conversationId: string) {
  const conversation = findConversation(conversationId)
  if (!conversation || !conversation.unreadCount) return
  conversation.unreadCount = 0
  saveState()
}

export function createConversation(input: {
  type: 'direct' | 'group'
  name: string | null
  participantIds: string[]
}): { conversation: Conversation; created: boolean } {
  const participantIds = Array.from(new Set([state.user.id, ...input.participantIds]))

  if (input.type === 'direct') {
    const existing = state.conversations.find(
      (c) =>
        c.type === 'direct' &&
        c.participants.length === participantIds.length &&
        participantIds.every((id) => c.participants.some((p) => p.id === id)),
    )
    if (existing) return { conversation: existing, created: false }
  }

  const conversation: Conversation = {
    id: `c_${crypto.randomUUID().slice(0, 8)}`,
    type: input.type,
    name: input.type === 'group' ? input.name : null,
    avatarUrl: null,
    // The creator owns the group (mirrors the backend's `Conversation.owner`).
    ownerId: input.type === 'group' ? state.user.id : null,
    participants: participantIds.map(toParticipant),
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
    unreadCount: 0,
  }
  state.conversations.unshift(conversation)
  state.messages[conversation.id] = []
  saveState()
  bus.emit('conversation:new', conversation)
  return { conversation, created: true }
}

/** Rename a group (`PATCH /conversations/:id`). */
export function renameConversation(id: string, name: string): Conversation | null {
  const conversation = findConversation(id)
  if (!conversation || conversation.type !== 'group') return null
  conversation.name = name
  saveState()
  bus.emit('conversation:updated', conversation)
  return conversation
}

/** Set or clear a group icon (`POST`/`DELETE /conversations/:id/avatar`). */
export function setConversationAvatar(
  id: string,
  avatarUrl: string | null,
): Conversation | null {
  const conversation = findConversation(id)
  if (!conversation || conversation.type !== 'group') return null
  conversation.avatarUrl = avatarUrl
  saveState()
  bus.emit('conversation:updated', conversation)
  return conversation
}

/** Add members to a group (`POST /conversations/:id/participants`). */
export function addConversationParticipants(
  id: string,
  userIds: string[],
): { conversation: Conversation; added: string[] } | null {
  const conversation = findConversation(id)
  if (!conversation || conversation.type !== 'group') return null
  const existing = new Set(conversation.participants.map((p) => p.id))
  const added = userIds.filter(
    (uid) => !existing.has(uid) && MOCK_USERS.some((u) => u.id === uid),
  )
  if (added.length === 0) return { conversation, added }
  conversation.participants.push(...added.map(toParticipant))
  saveState()
  bus.emit('conversation:updated', conversation)
  return { conversation, added }
}

/**
 * Remove a member from a group ("kick",
 * `DELETE /conversations/:id/participants/:participantId`).
 *
 * The caller (`mockApi`) enforces owner-only access. Remaining members see the
 * smaller participant list via `conversation:updated`; a removed member's own
 * client drops the chat on `conversation:removed`.
 */
export function removeConversationParticipant(
  id: string,
  participantId: string,
): Conversation | null {
  const conversation = findConversation(id)
  if (!conversation || conversation.type !== 'group') return null
  conversation.participants = conversation.participants.filter((p) => p.id !== participantId)
  saveState()
  if (participantId === state.user.id) {
    bus.emit('conversation:removed', { conversationId: conversation.id })
  } else {
    bus.emit('conversation:updated', conversation)
  }
  return conversation
}

/**
 * Forward a message into conversations and/or to people, creating direct chats
 * as needed (`POST /conversations/:id/messages/:messageId/forward`).
 *
 * Copies keep the content/attachments but are re-attributed to the current user
 * and marked `forwarded`. The forwarder receives the copies via the REST/socket
 * response, so — matching the real backend — no `message:new` is emitted here
 * (this mock has a single client). New direct chats still emit `conversation:new`.
 */
export function forwardMessage(input: {
  sourceConversationId: string
  messageId: string
  conversationIds: string[]
  userIds: string[]
}): { messages: Message[]; conversations: Conversation[] } | null {
  const source = (state.messages[input.sourceConversationId] ?? []).find(
    (m) => m.id === input.messageId,
  )
  if (!source) return null

  const me = state.user
  const messages: Message[] = []
  const conversations: Conversation[] = []
  const delivered = new Set<string>()

  const deliver = (conversationId: string) => {
    if (delivered.has(conversationId)) return
    delivered.add(conversationId)
    const copy: Message = {
      id: nextMessageId(),
      conversationId,
      content: source.content,
      type: source.type,
      attachments: source.attachments,
      sender: toParticipant(me.id),
      replyTo: null,
      status: 'sent',
      editedAt: null,
      forwarded: true,
      createdAt: new Date().toISOString(),
    }
    appendMessage(copy)
    messages.push(copy)
  }

  for (const conversationId of input.conversationIds) {
    if (findConversation(conversationId)) deliver(conversationId)
  }

  for (const userId of input.userIds) {
    if (userId === me.id) continue
    const { conversation, created } = createConversation({
      type: 'direct',
      name: null,
      participantIds: [userId],
    })
    if (created) conversations.push(conversation)
    deliver(conversation.id)
  }

  if (messages.length > 0) saveState()
  return { messages, conversations }
}

export function nextMessageId(): string {
  return `m_${crypto.randomUUID().slice(0, 10)}`
}


const SEARCH_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[٠-٩۰-۹]/g, (digit) => SEARCH_DIGITS[digit] ?? digit)
}

export function extractLinks(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const cleaned = matches.map((url) => url.replace(/[.,;:!?)]}"']+$/g, ''))
  return Array.from(new Set(cleaned))
}

function hasAttachmentType(message: Message, type: Attachment['type']): boolean {
  return message.attachments.some((attachment) => attachment.type === type)
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

function paginateDescending<T extends { id: string }>(
  descending: T[],
  cursorValue: string | null,
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  let start = 0
  if (cursorValue) {
    const cursorId = decodeCursor(cursorValue)
    const index = descending.findIndex((m) => m.id === cursorId)
    start = index === -1 ? 0 : index + 1
  }
  const page = descending.slice(start, start + limit)
  const hasMore = start + limit < descending.length
  const oldest = page[page.length - 1]
  return { items: page, hasMore, nextCursor: hasMore && oldest ? encodeCursor(oldest.id) : null }
}

export function conversationMedia(
  conversationId: string,
  filter: MediaFilter,
  cursor: string | null,
  limit: number,
): { items: MessageMediaItem[]; nextCursor: string | null; hasMore: boolean } {
  const all = state.messages[conversationId] ?? []
  const descending = [...all].reverse()
  const matches = (message: Message) => {
    switch (filter) {
      case 'image':
        return hasAttachmentType(message, 'image')
      case 'video':
        return hasAttachmentType(message, 'video')
      case 'audio':
        return hasAttachmentType(message, 'audio')
      case 'file':
        return hasAttachmentType(message, 'document')
      case 'link':
        return extractLinks(message.content).length > 0
      default:
        return message.attachments.length > 0 || extractLinks(message.content).length > 0
    }
  }
  const filtered = descending.filter(matches)
  const page = paginateDescending(filtered, cursor, limit)
  return {
    items: page.items.map((message) => ({ ...message, links: extractLinks(message.content) })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  }
}

export function searchMessages(
  rawQuery: string,
  cursor: string | null,
  limit: number,
): { items: MessageSearchHit[]; nextCursor: string | null; hasMore: boolean } {
  const query = rawQuery.trim()
  if (!/[\p{L}\p{N}]/u.test(query)) {
    return { items: [], nextCursor: null, hasMore: false }
  }
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { items: [], nextCursor: null, hasMore: false }

  const entries: Array<{ id: string; message: Message; conversation: Conversation }> = []
  for (const conversation of state.conversations) {
    for (const message of state.messages[conversation.id] ?? []) {
      const haystack = normalizeForSearch(
        `${message.content} ${message.attachments.map((a) => a.name).join(' ')}`,
      )
      if (tokens.every((token) => haystack.includes(token))) {
        entries.push({ id: message.id, message, conversation })
      }
    }
  }
  entries.sort((a, b) => Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt))
  const page = paginateDescending(entries, cursor, limit)
  return {
    items: page.items.map(({ message, conversation }) => ({ ...message, conversation })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  }
}

export type EditMessageResult =
  | { ok: true; message: Message }
  | { ok: false; status: number; error: string }

export function editMessage(
  conversationId: string,
  messageId: string,
  content: string,
): EditMessageResult {
  const list = state.messages[conversationId] ?? []
  const message = list.find((m) => m.id === messageId)
  if (!message) return { ok: false, status: 404, error: 'Message not found.' }
  if (message.sender.id !== state.user.id)
    return { ok: false, status: 403, error: 'You can only edit your own messages.' }
  if (message.type !== 'text')
    return { ok: false, status: 400, error: 'Only text messages can be edited.' }
  if (Date.now() - Date.parse(message.createdAt) >= EDIT_WINDOW_MS)
    return { ok: false, status: 400, error: 'This message is too old to edit.' }
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, status: 400, error: 'Message content cannot be empty.' }
  message.content = trimmed
  message.editedAt = new Date().toISOString()
  saveState()
  bus.emit('message:edited', message)
  return { ok: true, message }
}

export type MessageInfoResult =
  | { ok: true; info: MessageInfo }
  | { ok: false; status: number; error: string }

/**
 * Delivery/read detail for one of the current user's own messages
 * (`GET /conversations/:id/messages/:messageId/info`). Seeded messages only
 * carry an aggregate `status`, so per-recipient times are synthesised from it.
 * Direct chats honour the reader's `readReceipts`; groups always show everyone.
 */
export function messageInfo(conversationId: string, messageId: string): MessageInfoResult {
  const conversation = findConversation(conversationId)
  if (!conversation) return { ok: false, status: 404, error: 'Conversation not found.' }
  const message = (state.messages[conversationId] ?? []).find((m) => m.id === messageId)
  if (!message) return { ok: false, status: 404, error: 'Message not found.' }
  if (message.sender.id !== state.user.id)
    return { ok: false, status: 403, error: 'You can only view info for your own messages.' }

  const others = conversation.participants.filter((p) => p.id !== message.sender.id)
  const sentAt = Date.parse(message.createdAt)
  const entry = (user: Participant, offsetMs: number): MessageInfoEntry => ({
    user,
    at: new Date(sentAt + offsetMs).toISOString(),
  })

  // A direct chat hides the other member's read time when their receipts are off.
  const readReceiptsDisabled =
    conversation.type === 'direct' &&
    others.some((p) => MOCK_USERS.find((u) => u.id === p.id)?.settings.readReceipts === false)

  const deliveredTo: MessageInfoEntry[] = []
  const readBy: MessageInfoEntry[] = []
  const pending: Participant[] = []

  if (message.status === 'read') {
    deliveredTo.push(...others.map((p) => entry(p, 60_000)))
    if (!readReceiptsDisabled) readBy.push(...others.map((p) => entry(p, 180_000)))
  } else if (message.status === 'delivered') {
    deliveredTo.push(...others.map((p) => entry(p, 60_000)))
  } else {
    pending.push(...others)
  }

  return {
    ok: true,
    info: {
      messageId: message.id,
      conversationId,
      conversationType: conversation.type,
      status: message.status,
      deliveredTo,
      readBy,
      pending,
      readReceiptsDisabled,
    },
  }
}
/* -------------------------------------------------------------------------- */
/* Minimal event bus so the mock socket can deliver server -> client events.   */
/* -------------------------------------------------------------------------- */

type Handler = (payload: unknown) => void

class MockBus {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set<Handler>()
    set.add(handler)
    this.handlers.set(event, set)
    return () => this.off(event, handler)
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload)
  }
}
export const bus = new MockBus()
