import { useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { resolveMediaUrl } from '@/lib/media'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ImageViewer } from '@/components/chat/image-viewer'
import type { PresenceStatus } from '@/types/api'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Avatar with an optional presence dot.
 *
 * `status` renders a green dot when online and a muted dot when offline;
 * omit it entirely when presence is unknown or not relevant.
 *
 * `viewable` makes the image tappable: it opens a full-screen `ImageViewer`.
 * Only enable it where the avatar is not already nested inside another button
 * or link. Avatars without an image (initials/icon fallbacks) stay inert.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 'default',
  status,
  className,
  fallback,
  viewable,
}: {
  name: string
  avatarUrl?: string | null
  size?: 'default' | 'sm' | 'lg'
  status?: PresenceStatus
  className?: string
  fallback?: ReactNode
  viewable?: boolean
}) {
  const [viewing, setViewing] = useState(false)

  const avatar = (
    <Avatar size={size} className={className}>
      <AvatarImage src={avatarUrl ? resolveMediaUrl(avatarUrl) : undefined} alt={name} />
      <AvatarFallback className="text-xs">{fallback ?? initials(name)}</AvatarFallback>
      {status && (
        <AvatarBadge
          className={cn(
            status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/50',
          )}
        />
      )}
    </Avatar>
  )

  if (!viewable || !avatarUrl) return avatar

  return (
    <>
      <button
        type="button"
        onClick={() => setViewing(true)}
        aria-label={`View ${name}'s photo`}
        className="flex shrink-0 rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {avatar}
      </button>
      {viewing && (
        <ImageViewer src={avatarUrl} alt={name} onClose={() => setViewing(false)} />
      )}
    </>
  )
}
