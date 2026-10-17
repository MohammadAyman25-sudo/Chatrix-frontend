/**
 * Message media helpers.
 *
 * Attachments are uploaded **directly to R2** through the `sign → PUT → confirm`
 * flow (see `@/lib/uploads` and API_EXAMPLES.md → "Uploads (direct to R2)")
 * *before* the message is sent; the confirmed attachment objects are then sent
 * with the message over `message:send` or `POST /conversations/:id/messages`.
 */
import {
  ATTACHMENT_MAX_BYTES,
  attachmentType,
  type AttachmentType,
} from '@/lib/media'
import type { Attachment, MessageType } from '@/types/api'

export type { Attachment, MessageType, AttachmentType }

/** Client-side cap per send; each file is signed and confirmed on its own. */
export const MAX_ATTACHMENT_BYTES = ATTACHMENT_MAX_BYTES
export const MAX_ATTACHMENTS_PER_UPLOAD = 10

/** Local, pre-upload attachment shown in the composer. */
export type PendingAttachment = {
  id: string
  file: File
  type: AttachmentType
  name: string
  size: number
  /** Object URL for image/video previews; revoked when removed. */
  previewUrl: string | null
  /** Recorded voice-note length in seconds. */
  duration?: number
  status: 'uploading' | 'ready' | 'error'
  attachment?: Attachment
  error?: string
}

export function createPendingAttachment(file: File, duration?: number): PendingAttachment {
  const type = attachmentType(file.type, file.name)
  return {
    id: crypto.randomUUID(),
    file,
    type,
    name: file.name || 'Untitled',
    size: file.size,
    previewUrl:
      type === 'image' || type === 'video' ? URL.createObjectURL(file) : null,
    duration,
    status: 'uploading',
  }
}

export function revokePendingAttachment(attachment: PendingAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  const rounded = value >= 10 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[exponent]}`
}

/** `7` -> `0:07`, `75` -> `1:15`. */
export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/** Human label for a message's primary attachment, used in reply previews. */
export function attachmentLabel(type: AttachmentType, count = 1): string {
  const labels: Record<AttachmentType, [string, string]> = {
    image: ['Photo', 'Photos'],
    video: ['Video', 'Videos'],
    audio: ['Voice message', 'Voice messages'],
    document: ['Document', 'Documents'],
  }
  const [singular, plural] = labels[type]
  return count > 1 ? plural : singular
}

/**
 * Attachment URLs may be absolute or app-relative (`/uploads/...`). Re-exported
 * from `@/lib/media` so existing importers keep working.
 */
export { resolveMediaUrl } from '@/lib/media'
