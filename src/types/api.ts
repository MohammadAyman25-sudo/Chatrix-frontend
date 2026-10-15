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
  participants: Participant[]
  lastMessageAt: string | null
  createdAt: string
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

/** Attachment DTO returned by `POST /conversations/:id/attachments`. */
export type Attachment = {
  type: Exclude<MessageType, 'text'>
  /** Absolute URL or app-relative path (`/uploads/...`). */
  url: string
  /** Object storage key; present on freshly uploaded attachments. */
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
 * Response from `POST /conversations/:id/messages/:messageId/forward`.
 * `conversations` is only present when a new direct chat was created for a
 * `userIds` target.
 */
export type ForwardResult = {
  messages: Message[]
  conversations?: Conversation[]
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
