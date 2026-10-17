import type { Conversation } from '@/types/api'

/** Shared between the chat sidebar (layout) and the open room, via `<Outlet context>`. */
export type ChatOutletContext = {
  conversations: Conversation[]
  conversationsLoading: boolean
  upsertConversation: (conversation: Conversation) => void
  /** Drops a conversation from the sidebar, e.g. when the owner removed you. */
  removeConversation: (conversationId: string) => void
}
