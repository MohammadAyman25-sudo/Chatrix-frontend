export type PublicUser = {
  id: string
  username: string
  displayName: string | null
  email: string
  /** When false the account must verify its email before it can log in. */
  emailVerified: boolean
  bio: string | null
  avatarUrl: string | null
  settings: {
    theme: 'light' | 'dark' | 'system'
    notifications: boolean
    readReceipts: boolean
  }
  createdAt: string
}

export type Participant = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

/** Shape returned by `GET /users/search` and `GET /users/:userId` (no email/settings). */
export type UserSummary = {
  id: string
  username: string
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
}

export type Conversation = {
  id: string
  type: 'direct' | 'group'
  name: string | null
  /** Group icon; `null` for direct conversations or when unset. */
  avatarUrl: string | null
  /**
   * The **group owner** — the only member allowed to remove others
   * (`DELETE /conversations/:id/participants/:participantId`). Set to the
   * creator; groups created before ownership was stored fall back to their
   * first participant. Always `null` for direct conversations.
   */
  ownerId: string | null
  participants: Participant[]
  lastMessageAt: string | null
  createdAt: string
  /**
   * Messages addressed to the caller that they have not read yet (own messages
   * never count). Only `GET /conversations` returns it: realtime
   * `conversation:new` / `conversation:updated` payloads omit it, so clients
   * maintain the count locally. Treat a missing value as `0`.
   */
  unreadCount?: number
}

/** Live presence state for a user. `lastSeenAt` is null while online. */
export type PresenceStatus = 'online' | 'offline'

/** Item shape returned by `GET /conversations/:id/presence` and `presence:update`. */
export type PresenceEntry = {
  userId: string
  status: PresenceStatus
  lastSeenAt: string | null
}

/** Media kinds a message can carry. `text` is the no-attachment default. */
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document'

/**
 * Attachment DTO as returned by the upload confirm step
 * (`POST /uploads/:uploadId/confirm`, scope `message`).
 */
export type Attachment = {
  type: Exclude<MessageType, 'text'>
  /** Absolute URL (R2 public bucket) or app-relative path for legacy uploads. */
  url: string
  /** Legacy object-storage key; new uploads no longer expose it. */
  key?: string
  name: string
  size: number
  mimeType: string
  /** Duration in seconds; present for audio/video (voice notes). */
  duration?: number
}

/**
 * Snapshot of the quoted message embedded in a reply. Mirrors the `replyTo`
 * object documented in API_EXAMPLES.md.
 */
export type MessageReply = {
  id: string
  content: string
  type: MessageType
  attachments: Attachment[]
  sender: Participant
}

export type Message = {
  id: string
  conversationId: string
  content: string
  type: MessageType
  attachments: Attachment[]
  sender: Participant
  replyTo: MessageReply | null
  status: 'sent' | 'delivered' | 'read'
  /** When the content was last edited; `null` if never. */
  editedAt: string | null
  /** True when the message was forwarded (recipients see a "Forwarded" label). */
  forwarded: boolean
  createdAt: string
}

/**
 * UI-only view of a message. `pending` marks an optimistic message awaiting the
 * server ack; `failed` marks one whose send was rejected (offering a retry).
 */
export type ChatMessage = Message & {
  pending?: boolean
  failed?: boolean
}

export type PaginatedMessages = {
  items: Message[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * `type` filter for `GET /conversations/:id/media`. `file` matches documents;
 * `link` matches messages whose text contains a URL; `all` is their union.
 */
export type MediaFilter = 'all' | 'image' | 'video' | 'audio' | 'file' | 'link'

/** Item from `GET /conversations/:id/media`: a `MessageDto` plus URLs found in its text. */
export type MessageMediaItem = Message & {
  /** URLs extracted from the message text; `[]` when there are none. */
  links: string[]
}

export type PaginatedMedia = {
  items: MessageMediaItem[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Hit from `GET /messages/search`. The endpoint searches every conversation the
 * caller belongs to, so each hit carries the `conversation` it came from (used
 * to render the chat title and to scope results to the open conversation).
 */
export type MessageSearchHit = Message & {
  conversation: Conversation
}

export type PaginatedMessageSearch = {
  items: MessageSearchHit[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Response from `POST /conversations/:id/messages/:messageId/forward`.
 * `conversations` is only present when a new direct chat was created for a
 * `userIds` target.
 */
export type ForwardResult = {
  messages: Message[]
  conversations?: Conversation[]
}

/**
 * Response from `POST /conversations/:id/messages` (and the `message:send`
 * socket ack). `conversation` is only present when a **private reply**
 * (`replyPrivately`) had to create the direct chat it was delivered to.
 */
export type SendMessageResult = {
  message: Message
  conversation?: Conversation
}

/** A recipient of a message with the time they received/read it (`null` when untracked). */
export type MessageInfoEntry = {
  user: Participant
  at: string | null
}

/**
 * Response from `GET /conversations/:id/messages/:messageId/info` — the
 * delivery/read detail for one of your own messages. Direct chats honour the
 * reader's `settings.readReceipts`; groups ignore it.
 */
export type MessageInfo = {
  messageId: string
  conversationId: string
  conversationType: Conversation['type']
  /** Aggregate status from your point of view, same as the message's `status`. */
  status: Message['status']
  deliveredTo: MessageInfoEntry[]
  readBy: MessageInfoEntry[]
  /** Recipients who have neither received nor read it yet. */
  pending: Participant[]
  /** True when a direct chat hides the other member's read time (their receipts are off). */
  readReceiptsDisabled: boolean
}

export type PaginatedConversations = {
  items: Conversation[]
}

/**
 * Response from `POST /auth/register`. With email verification enabled no
 * session is created and `emailVerificationSent` is `true`; otherwise the
 * account is signed in immediately.
 */
export type RegisterResponse = {
  user: PublicUser
  emailVerificationSent?: boolean
}
