/**
 * Framework-free media constants and helpers shared by the API client, the
 * attachment uploader, and the in-browser mock. Kept dependency-free so it can
 * be imported from anywhere without creating import cycles.
 */

/** Backend origin. Attachment URLs returned as `/uploads/...` resolve against it. */
export const API_ORIGIN = 'http://localhost:5000'

export type AttachmentType = 'image' | 'video' | 'audio' | 'document'

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
