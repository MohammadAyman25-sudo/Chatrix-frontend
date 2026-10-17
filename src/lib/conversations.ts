/**
 * Framework-free helpers for rendering conversations, shared by the sidebar,
 * the chat header and the forward dialog.
 */
import type { Conversation, Participant } from '@/types/api'

/** The other person in a direct conversation (or `null` for groups). */
export function otherParticipant(
  conversation: Conversation,
  meId: string | undefined,
): Participant | null {
  if (conversation.type === 'group') return null
  return (
    conversation.participants.find((p) => p.id !== meId) ?? conversation.participants[0] ?? null
  )
}

/**
 * True when `userId` owns the group. Only the owner may remove members
 * (`DELETE /conversations/:id/participants/:participantId`).
 */
export function isGroupOwner(conversation: Conversation, userId: string | undefined): boolean {
  return conversation.type === 'group' && Boolean(userId) && conversation.ownerId === userId
}

/** Group name, or the other member's display name for a direct chat. */
export function conversationTitle(conversation: Conversation, meId: string | undefined): string {
  if (conversation.type === 'group') return conversation.name || 'Group'
  const other = conversation.participants.find((p) => p.id !== meId)
  return other?.displayName || other?.username || 'Conversation'
}
