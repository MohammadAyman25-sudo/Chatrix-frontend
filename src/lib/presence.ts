/**
 * Presence helpers.
 *
 * Presence is not persisted (only `lastSeenAt` is), so the UI derives a
 * human-readable label from a `PresenceEntry`. See API_EXAMPLES.md.
 */
import type { PresenceEntry } from '@/types/api'

/** `Online`, `Last seen just now`, `Last seen 5m ago`, … */
export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Offline'
  const then = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(then)) return 'Offline'

  const diff = Date.now() - then
  if (diff < 45_000) return 'Last seen just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `Last seen ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last seen ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Last seen ${days}d ago`
  return `Last seen ${new Date(lastSeenAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })}`
}

/**
 * Presence text for a user. Returns `null` when we have no information yet so
 * callers can fall back to whatever they showed before.
 */
export function presenceLabel(
  entry: PresenceEntry | undefined,
  isSelf = false,
): string | null {
  if (isSelf) return 'Online'
  if (!entry) return null
  if (entry.status === 'online') return 'Online'
  return formatLastSeen(entry.lastSeenAt)
}

export function isOnline(entry: PresenceEntry | undefined): boolean {
  return entry?.status === 'online'
}
