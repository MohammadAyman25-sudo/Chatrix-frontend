/**
 * Message rules shared by the message list, the edit control and the API
 * fallback. The backend is the source of truth (see API_EXAMPLES.md); these
 * helpers keep the UI in step with it.
 */
import type { ChatMessage } from '@/types/api'

/**
 * A message may be edited by its sender for 15 minutes after it was sent
 * (`PATCH /conversations/:id/messages/:messageId`). After that the backend
 * rejects the edit with `400`, so the UI hides the control.
 */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/** True while `createdAt` is still inside the 15-minute edit window. */
export function withinEditWindow(createdAt: string, now = Date.now()): boolean {
  const sent = new Date(createdAt).getTime()
  if (!Number.isFinite(sent)) return false
  return now - sent < EDIT_WINDOW_MS
}

/**
 * Whether the API would accept an edit for this message: the caller's own,
 * text-only (media messages are not editable), settled, and within the window.
 * `isOwn` is passed in because ownership is decided by the caller's identity.
 */
export function isEditableMessage(
  message: ChatMessage,
  isOwn: boolean,
  now = Date.now(),
): boolean {
  return (
    isOwn &&
    message.type === 'text' &&
    !message.pending &&
    !message.failed &&
    withinEditWindow(message.createdAt, now)
  )
}

/**
 * Whether a **private reply** (`replyPrivately`) can target this message. The
 * API delivers it as a DM to the quoted message's author, and rejects replies
 * to your own message, so the quote must be someone else's. Only meaningful in
 * groups: in a direct chat the DM *is* the open conversation.
 */
export function canReplyPrivately(message: ChatMessage, isOwn: boolean): boolean {
  return !isOwn && !message.pending && !message.failed && Boolean(message.sender?.id)
}
