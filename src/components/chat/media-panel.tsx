import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  FileText,
  ImageOff,
  Images,
  Link2,
  Loader2,
  Mic,
  Play,
  X,
} from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type {
  Attachment,
  Conversation,
  MediaFilter,
  MessageMediaItem,
  PaginatedMedia,
} from '@/types/api'
import { formatBytes, formatDuration, resolveMediaUrl } from '@/lib/attachments'
import { textDirection } from '@/lib/direction'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 30

const TABS: { value: MediaFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'file', label: 'Docs' },
  { value: 'link', label: 'Links' },
]

/** One attachment of one message, with its index inside that message. */
type AttachmentEntry = {
  message: MessageMediaItem
  attachment: Attachment
  /** Index of the attachment within `message.attachments` (for the lightbox). */
  index: number
}

type LinkEntry = { message: MessageMediaItem; url: string }

function senderName(message: MessageMediaItem): string {
  return message.sender.displayName || message.sender.username
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function collectAttachments(
  items: MessageMediaItem[],
  type: Attachment['type'],
): AttachmentEntry[] {
  const entries: AttachmentEntry[] = []
  for (const message of items) {
    message.attachments.forEach((attachment, index) => {
      if (attachment.type === type) entries.push({ message, attachment, index })
    })
  }
  return entries
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function Thumb({
  entry,
  onOpen,
}: {
  entry: AttachmentEntry
  onOpen: (attachments: Attachment[], index: number) => void
}) {
  const [failed, setFailed] = useState(false)
  const { attachment, index, message } = entry
  const isVideo = attachment.type === 'video'

  return (
    <button
      type="button"
      onClick={() => onOpen(message.attachments, index)}
      className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`Open ${attachment.name}`}
    >
      {failed ? (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : isVideo ? (
        <video
          src={`${resolveMediaUrl(attachment.url)}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src={resolveMediaUrl(attachment.url)}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform motion-reduce:transform-none group-hover:scale-[1.03]"
        />
      )}
      {isVideo && !failed && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
            <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
          </span>
        </span>
      )}
    </button>
  )
}

function Grid({
  entries,
  onOpen,
}: {
  entries: AttachmentEntry[]
  onOpen: (attachments: Attachment[], index: number) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map((entry) => (
        <Thumb
          key={`${entry.message.id}-${entry.attachment.url}-${entry.index}`}
          entry={entry}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function AudioRow({ entry }: { entry: AttachmentEntry }) {
  const { attachment, message } = entry
  return (
    <li className="rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{senderName(message)}</span>
        <span className="shrink-0">{formatWhen(message.createdAt)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Mic className="h-4 w-4" aria-hidden="true" />
        </span>
        <audio
          controls
          preload="metadata"
          src={resolveMediaUrl(attachment.url)}
          className="h-8 min-w-0 flex-1"
        />
        {attachment.duration != null && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatDuration(attachment.duration)}
          </span>
        )}
      </div>
    </li>
  )
}

function FileRow({ entry }: { entry: AttachmentEntry }) {
  const { attachment, message } = entry
  return (
    <li>
      <a
        href={resolveMediaUrl(attachment.url)}
        download={attachment.name}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{attachment.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {formatBytes(attachment.size)} · {senderName(message)} ·{' '}
            {formatWhen(message.createdAt)}
          </span>
        </span>
        <Download className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
      </a>
    </li>
  )
}

function LinkRow({ entry }: { entry: LinkEntry }) {
  const { message, url } = entry
  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-start gap-3 rounded-lg border p-2 transition-colors hover:bg-muted"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{hostname(url)}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{url}</span>
          {message.content && (
            <span
              dir={textDirection(message.content)}
              className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
            >
              {message.content}
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Images className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * The conversation's "Media, links and docs" panel
 * (`GET /conversations/:id/media`). Tabs map to the endpoint's `type` filter;
 * photos/videos open in the shared lightbox, documents and links open inline.
 */
export function MediaPanel({
  conversation,
  onOpenMedia,
  onClose,
  className,
}: {
  conversation: Conversation
  onOpenMedia: (attachments: Attachment[], index: number) => void
  onClose: () => void
  className?: string
}) {
  const [tab, setTab] = useState<MediaFilter>('all')
  const [items, setItems] = useState<MessageMediaItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conversationId = conversation.id

  const fetchMedia = useCallback(
    async (filter: MediaFilter, cursorValue: string | null) => {
      const res = await api.get<PaginatedMedia>(`/conversations/${conversationId}/media`, {
        params: { type: filter, limit: PAGE_SIZE, ...(cursorValue ? { cursor: cursorValue } : {}) },
      })
      return res.data
    },
    [conversationId],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    setCursor(null)
    setHasMore(false)
    ;(async () => {
      try {
        const data = await fetchMedia(tab, null)
        if (cancelled) return
        setItems(data.items)
        setCursor(data.nextCursor)
        setHasMore(data.hasMore)
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, 'Could not load media.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, fetchMedia])

  const loadMore = async () => {
    if (loadingMore || !cursor) return
    setLoadingMore(true)
    setError(null)
    try {
      const data = await fetchMedia(tab, cursor)
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id))
        return [...prev, ...data.items.filter((item) => !seen.has(item.id))]
      })
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load more media.'))
    } finally {
      setLoadingMore(false)
    }
  }

  const photos = useMemo(() => collectAttachments(items, 'image'), [items])
  const videos = useMemo(() => collectAttachments(items, 'video'), [items])
  const audio = useMemo(() => collectAttachments(items, 'audio'), [items])
  const documents = useMemo(() => collectAttachments(items, 'document'), [items])
  const links = useMemo<LinkEntry[]>(
    () => items.flatMap((message) => message.links.map((url) => ({ message, url }))),
    [items],
  )

  const isEmpty =
    photos.length === 0 &&
    videos.length === 0 &&
    audio.length === 0 &&
    documents.length === 0 &&
    links.length === 0

  const emptyLabel: Record<MediaFilter, string> = {
    all: 'No media, links or docs yet.',
    image: 'No photos yet.',
    video: 'No videos yet.',
    audio: 'No audio yet.',
    file: 'No documents yet.',
    link: 'No links yet.',
  }

  return (
    <aside
      aria-label="Media, links and docs"
      className={cn('flex flex-col border-l bg-background shadow-xl md:shadow-none', className)}
    >
      <div className="flex items-center justify-between gap-2 border-b p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 md:pt-3">
        <h2 className="text-sm font-semibold">Media, links and docs</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close media panel"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Filter media"
        className="flex gap-1 overflow-x-auto border-b p-2"
      >
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => setTab(entry.value)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              tab === entry.value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
          </div>
        )}

        {!loading && error && (
          <p className="px-3 py-14 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && isEmpty && <EmptyState label={emptyLabel[tab]} />}

        {!loading && !error && !isEmpty && (
          <div className="flex flex-col gap-4">
            {(tab === 'all' || tab === 'image') && photos.length > 0 && (
              <section className="flex flex-col gap-1.5">
                {tab === 'all' && <SectionLabel>Photos</SectionLabel>}
                <Grid entries={photos} onOpen={onOpenMedia} />
              </section>
            )}

            {(tab === 'all' || tab === 'video') && videos.length > 0 && (
              <section className="flex flex-col gap-1.5">
                {tab === 'all' && <SectionLabel>Videos</SectionLabel>}
                <Grid entries={videos} onOpen={onOpenMedia} />
              </section>
            )}

            {(tab === 'all' || tab === 'audio') && audio.length > 0 && (
              <section className="flex flex-col gap-1.5">
                {tab === 'all' && <SectionLabel>Audio</SectionLabel>}
                <ul className="flex flex-col gap-1.5">
                  {audio.map((entry) => (
                    <AudioRow
                      key={`${entry.message.id}-${entry.attachment.url}-${entry.index}`}
                      entry={entry}
                    />
                  ))}
                </ul>
              </section>
            )}

            {(tab === 'all' || tab === 'file') && documents.length > 0 && (
              <section className="flex flex-col gap-1.5">
                {tab === 'all' && <SectionLabel>Documents</SectionLabel>}
                <ul className="flex flex-col gap-1.5">
                  {documents.map((entry) => (
                    <FileRow
                      key={`${entry.message.id}-${entry.attachment.url}-${entry.index}`}
                      entry={entry}
                    />
                  ))}
                </ul>
              </section>
            )}

            {(tab === 'all' || tab === 'link') && links.length > 0 && (
              <section className="flex flex-col gap-1.5">
                {tab === 'all' && <SectionLabel>Links</SectionLabel>}
                <ul className="flex flex-col gap-1.5">
                  {links.map((entry) => (
                    <LinkRow key={`${entry.message.id}-${entry.url}`} entry={entry} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {!loading && !error && hasMore && (
        <div className="border-t p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Load more
          </Button>
        </div>
      )}
    </aside>
  )
}
