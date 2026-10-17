/**
 * Framework-free media constants and helpers shared by the API client, the
 * attachment uploader, and the in-browser mock. Kept dependency-free so it can
 * be imported from anywhere without creating import cycles.
 */
import type { Attachment } from '@/types/api'

/**
 * Backend origin. Attachment/avatar URLs returned as `/uploads/...` resolve
 * against it. Override with `VITE_API_ORIGIN` to point at a remote backend.
 */
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000'

export type AttachmentType = 'image' | 'video' | 'audio' | 'document'

/** `scope` of a `POST /uploads/sign` request. */
export type UploadScope = 'message' | 'avatar' | 'group-icon'

/** Body of a `POST /uploads/sign` request (see API_EXAMPLES.md). */
export type SignUploadInput = {
  scope: UploadScope
  /** Required for `message` / `group-icon`, rejected for `avatar`. */
  conversationId?: string
  name: string
  /** Exact byte count of the file about to be uploaded (re-checked on confirm). */
  size: number
  mimeType: string
  /** Recording length in seconds; kept on audio/video attachments. */
  duration?: number
}

/** Byte limits for `POST /uploads/sign` (the backend answers `413` past them). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024

/** MIME allow-list for `scope: 'avatar'` / `scope: 'group-icon'`. */
export const AVATAR_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

/** MIME allow-list for `scope: 'message'` (mirrors the backend's `utils/media.ts`). */
export const MESSAGE_MEDIA_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'text/plain',
  'text/csv',
  'application/rtf',
]

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba']

export function attachmentType(mime: string, name = ''): AttachmentType {
  const type = mime.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  return 'document'
}

/**
 * Attachment/avatar/group-icon URLs may be absolute or app-relative
 * (`/uploads/...`). Resolve the relative form against the backend origin so
 * media renders from any host.
 */
export function resolveMediaUrl(url: string): string {
  if (!url) return url
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * Sign-time MIME/size validation mirroring the backend's `assertUploadConstraints`:
 * `null` when the upload may be signed, otherwise the status + message the API
 * would answer with (`400` for a MIME violation, `413` for exceeding the limit).
 */
export function checkUploadConstraints(
  input: SignUploadInput,
): { status: number; message: string } | null {
  const isAvatar = input.scope === 'avatar'
  const allowed = isAvatar ? AVATAR_MIME_TYPES : MESSAGE_MEDIA_MIME_TYPES
  if (!allowed.includes(input.mimeType)) {
    return {
      status: 400,
      message: isAvatar
        ? 'Only JPEG, PNG, WebP or GIF images are allowed'
        : `Unsupported file type: ${input.mimeType}`,
    }
  }
  const limit = isAvatar ? AVATAR_MAX_BYTES : ATTACHMENT_MAX_BYTES
  if (input.size > limit) {
    return {
      status: 413,
      message: `File is larger than the ${Math.round(limit / (1024 * 1024))} MB limit`,
    }
  }
  return null
}

/**
 * Builds the `attachment` DTO a `confirm` answers with for `scope: 'message'`
 * (`url` is the public URL of the object that just landed in storage).
 */
export function confirmedAttachment(
  input: SignUploadInput,
  url: string,
  type: AttachmentType = attachmentType(input.mimeType, input.name),
): Attachment {
  return {
    type,
    url,
    name: input.name,
    size: input.size,
    mimeType: input.mimeType,
    ...(input.duration ? { duration: input.duration } : {}),
  }
}
