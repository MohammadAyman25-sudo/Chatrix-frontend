import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, ImageOff, Mic, Pause, Play, X } from 'lucide-react'
import { cn } from 'cn'
import type { Attachment } from '@/types/api'
import { formatBytes, formatDuration, resolveMediaUrl } from '@/lib/attachments'

const isImage = (a: Attachment) => a.type === 'image'

function SafeImage({
  attachment,
  className,
  onClick,
}: {
  attachment: Attachment
  className?: string
  onClick?: () => void
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          className,
        )}
        aria-label={attachment.name}
      >
        <ImageOff className="h-6 w-6" />
      </div>
    )
  }

  return (
    <img
      src={resolveMediaUrl(attachment.url)}
      alt={attachment.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      onClick={onClick}
      className={cn('object-cover', onClick && 'cursor-zoom-in', className)}
    />
  )
}

function DocumentCard({ attachment, isOwn }: { attachment: Attachment; isOwn: boolean }) {
  return (
    <a
      href={resolveMediaUrl(attachment.url)}
      download={attachment.name}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex items-center gap-3 rounded-xl border p-2.5 pr-3 transition-colors',
        isOwn
          ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20'
          : 'border-border bg-background/60 hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          isOwn ? 'bg-primary-foreground/15' : 'bg-muted',
        )}
      >
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name}</span>
        <span
          className={cn(
            'block text-xs',
            isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {formatBytes(attachment.size)}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" />
    </a>
  )
}

/** Deterministic pseudo-waveform derived from the attachment URL. */
function waveform(seed: string, count = 32): number[] {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const bars: number[] = []
  for (let i = 0; i < count; i += 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507)
    const value = ((hash >>> 0) % 1000) / 1000
    bars.push(0.28 + value * 0.72)
  }
  return bars
}

function VoiceNotePlayer({ attachment, isOwn }: { attachment: Attachment; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const bars = useMemo(() => waveform(attachment.url), [attachment.url])
  const total = attachment.duration ?? 0

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const seekTo = (ratio: number) => {
    const el = audioRef.current
    if (!el) return
    const runtime = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total
    el.currentTime = Math.max(0, Math.min(1, ratio)) * runtime
    setProgress(Math.max(0, Math.min(1, ratio)))
  }

  const remaining = playing || elapsed > 0 ? total - elapsed : total

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border py-2 pl-2 pr-3',
        isOwn
          ? 'border-primary-foreground/20 bg-primary-foreground/10'
          : 'border-border bg-background/60',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
          isOwn
            ? 'bg-primary-foreground text-primary'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
      </button>

      <button
        type="button"
        aria-label="Seek voice message"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          seekTo((event.clientX - rect.left) / rect.width)
        }}
        className="flex h-8 flex-1 items-center gap-[2px]"
      >
        {bars.map((height, index) => {
          const played = index / bars.length <= progress
          return (
            <span
              key={index}
              style={{ height: `${Math.round(height * 100)}%` }}
              className={cn(
                'w-[3px] shrink-0 rounded-full transition-colors',
                played
                  ? isOwn
                    ? 'bg-primary-foreground'
                    : 'bg-primary'
                  : isOwn
                    ? 'bg-primary-foreground/30'
                    : 'bg-muted-foreground/30',
              )}
            />
          )
        })}
      </button>

      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-xs tabular-nums',
          isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        <Mic className="h-3 w-3" />
        {formatDuration(Math.max(0, remaining))}
      </span>

      <audio
        ref={audioRef}
        src={resolveMediaUrl(attachment.url)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
          setElapsed(0)
        }}
        onTimeUpdate={(event) => {
          const el = event.currentTarget
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setProgress(el.currentTime / el.duration)
          }
          setElapsed(el.currentTime)
        }}
        className="hidden"
      />
    </div>
  )
}

function AudioPlayer({ attachment, isOwn }: { attachment: Attachment; isOwn: boolean }) {
  if (attachment.duration != null) {
    return <VoiceNotePlayer attachment={attachment} isOwn={isOwn} />
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5',
        isOwn
          ? 'border-primary-foreground/20 bg-primary-foreground/10'
          : 'border-border bg-background/60',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          isOwn ? 'bg-primary-foreground/15' : 'bg-muted',
        )}
      >
        <Mic className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <audio
          controls
          preload="metadata"
          src={resolveMediaUrl(attachment.url)}
          className="h-9 w-full max-w-64"
        >
          <track kind="captions" />
        </audio>
      </div>
    </div>
  )
}

function VideoPlayer({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-xl">
      <video
        src={resolveMediaUrl(attachment.url)}
        controls
        preload="metadata"
        className="max-h-72 w-full max-w-sm bg-black"
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open video"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Play className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function MessageAttachments({
  attachments,
  isOwn,
  onOpen,
}: {
  attachments: Attachment[]
  isOwn: boolean
  onOpen: (kind: 'image' | 'video', index: number) => void
}) {
  const images = attachments.filter(isImage)
  const media = attachments.filter((a) => !isImage(a))

  return (
    <div className="flex flex-col gap-1.5">
      {images.length > 0 && (
        <div
          className={cn(
            'grid gap-1 overflow-hidden rounded-xl',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {images.map((image) => {
            const absoluteIndex = attachments.indexOf(image)
            return (
              <SafeImage
                key={`${image.url}-${absoluteIndex}`}
                attachment={image}
                onClick={() => onOpen('image', absoluteIndex)}
                className={cn(
                  'w-full',
                  images.length === 1
                    ? 'max-h-72 rounded-xl'
                    : 'aspect-square rounded-lg',
                )}
              />
            )
          })}
        </div>
      )}

      {media.map((attachment) => {
        const index = attachments.indexOf(attachment)
        if (attachment.type === 'video') {
          return (
            <VideoPlayer
              key={`${attachment.url}-${index}`}
              attachment={attachment}
              onOpen={() => onOpen('video', index)}
            />
          )
        }
        if (attachment.type === 'audio') {
          return (
            <AudioPlayer key={`${attachment.url}-${index}`} attachment={attachment} isOwn={isOwn} />
          )
        }
        return (
          <DocumentCard key={`${attachment.url}-${index}`} attachment={attachment} isOwn={isOwn} />
        )
      })}
    </div>
  )
}

export function Lightbox({
  attachments,
  index,
  onClose,
}: {
  attachments: Attachment[]
  index: number
  onClose: () => void
}) {
  const attachment = attachments[index]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  if (!attachment) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        {attachment.type === 'video' ? (
          <video
            src={resolveMediaUrl(attachment.url)}
            controls
            autoPlay
            className="max-h-[85vh] w-full rounded-lg"
          />
        ) : (
          <img
            src={resolveMediaUrl(attachment.url)}
            alt={attachment.name}
            className="max-h-[85vh] w-full rounded-lg object-contain"
          />
        )}
        <div className="mt-3 flex items-center justify-between gap-4 text-sm text-white/80">
          <span className="truncate">{attachment.name}</span>
          <a
            href={resolveMediaUrl(attachment.url)}
            download={attachment.name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 transition-colors hover:bg-white/20"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>
    </div>
  )
}
