/**
 * Direct-to-R2 uploads: `sign → PUT → confirm`.
 *
 * File bytes never pass through this API. `POST /uploads/sign` validates the
 * request (scope, conversation membership, MIME allow-list, size) and returns a
 * presigned `PUT` URL whose `headers` must be echoed exactly — the `Content-Type`
 * is part of the signature. Once the bytes are in the bucket,
 * `POST /uploads/:uploadId/confirm` re-verifies them and answers with the
 * `attachment` (scope `message`), the updated `user` (scope `avatar`) or the
 * updated `conversation` (scope `group-icon`).
 *
 * The confirmed `attachment` is what goes into `message:send` /
 * `POST /conversations/:id/messages`. See API_EXAMPLES.md → "Uploads (direct to R2)".
 */
import api from '@/lib/api'
import { USE_MOCK } from '@/lib/mock/config'
import {
  AVATAR_MAX_BYTES,
  ATTACHMENT_MAX_BYTES,
  type SignUploadInput,
} from '@/lib/media'
import type { Attachment, Conversation, PublicUser } from '@/types/api'

export { AVATAR_MAX_BYTES, ATTACHMENT_MAX_BYTES }
export type { SignUploadInput, UploadScope } from '@/lib/media'

/** Presigned `PUT` returned by `POST /uploads/sign`. */
export type SignedUpload = {
  id: string
  key: string
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: string
}

/**
 * Error carrying the API's `{ message }` body shape, so failures raised by the
 * presigned `PUT` itself surface through `apiErrorMessage` like any other error.
 */
class UploadError extends Error {
  response: { status: number; data: { message: string } }
  constructor(status: number, message: string) {
    super(message)
    this.response = { status, data: { message } }
  }
}

/** Fallbacks for files the browser could not tag with a MIME type. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  weba: 'audio/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
}

function mimeTypeFor(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/**
 * Step 1 — reserve the object key and get the presigned `PUT` URL (valid 15 min).
 *
 * `file` is only forwarded in mock mode: there is no bucket to talk to, so the
 * in-browser stand-in keeps the bytes for its `confirm` step instead.
 */
export async function signUpload(input: SignUploadInput, file?: Blob): Promise<SignedUpload> {
  const body = USE_MOCK && file ? { ...input, file } : input
  const res = await api.post<{ upload: SignedUpload }>('/uploads/sign', body)
  return res.data.upload
}

/**
 * Step 2 — send the bytes straight to R2 with the signed headers.
 *
 * Mock sign responses carry a `mock://` placeholder URL (nothing to PUT to), so
 * that case is a no-op. A failed PUT is re-shaped into the API error format so
 * callers can keep using `apiErrorMessage`.
 */
export async function putSignedUpload(upload: SignedUpload, file: Blob): Promise<void> {
  if (!/^https?:/i.test(upload.url)) return
  let response: Response
  try {
    response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    })
  } catch {
    throw new UploadError(0, 'The file could not be uploaded. Check your connection and retry.')
  }
  if (!response.ok) {
    throw new UploadError(
      response.status,
      `Storage rejected the upload (${response.status}). Try again with a fresh file.`,
    )
  }
}

/** Steps 1 + 2 in one place; every scope runs them before confirming. */
async function signAndPut(input: SignUploadInput, file: File): Promise<string> {
  const upload = await signUpload(input, file)
  await putSignedUpload(upload, file)
  return upload.id
}

/**
 * Uploads one message attachment (media, voice note, document) and returns the
 * confirmed DTO to pass in `attachments`.
 */
export async function uploadMessageAttachment(
  conversationId: string,
  file: File,
  duration?: number,
): Promise<Attachment> {
  const mimeType = mimeTypeFor(file)
  const uploadId = await signAndPut(
    {
      scope: 'message',
      conversationId,
      name: file.name || 'attachment',
      size: file.size,
      mimeType,
      ...(duration != null && Number.isFinite(duration) && duration > 0
        ? { duration: Math.max(1, Math.round(duration)) }
        : {}),
    },
    file,
  )
  const res = await api.post<{ attachment: Attachment }>(`/uploads/${uploadId}/confirm`)
  return res.data.attachment
}

/** Uploads the caller's avatar (`scope: 'avatar'` — no `conversationId`). */
export async function uploadAvatar(file: File): Promise<PublicUser> {
  const uploadId = await signAndPut(
    {
      scope: 'avatar',
      name: file.name || 'avatar',
      size: file.size,
      mimeType: mimeTypeFor(file),
    },
    file,
  )
  const res = await api.post<{ user: PublicUser }>(`/uploads/${uploadId}/confirm`)
  return res.data.user
}

/** Replaces a group's icon (`scope: 'group-icon'`). */
export async function uploadGroupIcon(conversationId: string, file: File): Promise<Conversation> {
  const uploadId = await signAndPut(
    {
      scope: 'group-icon',
      conversationId,
      name: file.name || 'icon',
      size: file.size,
      mimeType: mimeTypeFor(file),
    },
    file,
  )
  const res = await api.post<{ conversation: Conversation }>(`/uploads/${uploadId}/confirm`)
  return res.data.conversation
}
