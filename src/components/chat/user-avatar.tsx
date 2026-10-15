import type { ReactNode } from 'react'
import { cn } from 'cn'
import { resolveMediaUrl } from '@/lib/media'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 'default',
  status,
  className,
  fallback,
}: {
  name: string
  avatarUrl?: string | null
  size?: 'default' | 'sm' | 'lg'
  status?: PresenceStatus
  className?: string
  fallback?: ReactNode
}) {
  return (
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
}
