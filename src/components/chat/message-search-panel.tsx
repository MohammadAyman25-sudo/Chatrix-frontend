import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Search, X } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { Conversation, MessageSearchHit, PaginatedMessageSearch } from '@/types/api'
import { attachmentLabel } from '@/lib/attachments'
import { textDirection } from '@/lib/direction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/chat/user-avatar'

const PAGE_SIZE = 20
/** Debounce window before a keystroke hits the rate-limited search endpoint. */
const DEBOUNCE_MS = 300
/**
 * `GET /messages/search` spans every conversation, so a page can be mostly
 * hits from other chats. Scan up to this many pages per call while filling the
 * results for the open conversation before giving the user a "Load more".
 */
const MAX_PAGES_PER_CALL = 5

type SearchPage = {
  hits: MessageSearchHit[]
  nextCursor: string | null
  hasMore: boolean
}

function messagePreview(hit: MessageSearchHit): string {
  const text = hit.content?.trim()
  if (text) return text
  const first = hit.attachments?.[0]
  if (first) return attachmentLabel(first.type, hit.attachments.length)
  return 'Message'
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Searches the messages of the open conversation.
 *
 * The API only exposes a cross-conversation `GET /messages/search` (there is no
 * per-conversation variant), so this panel asks for the global feed and keeps
 * the hits whose `conversation.id` matches — paging until it has enough, or
 * until the search is exhausted.
 */
export function MessageSearchPanel({
  conversation,
  meId,
  onSelect,
  onClose,
}: {
  conversation: Conversation
  meId?: string
  onSelect: (messageId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MessageSearchHit[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestRef = useRef(0)
  const trimmed = query.trim()
  const conversationId = conversation.id

  const fetchHits = useCallback(
    async (q: string, cursor: string | null, signal?: AbortSignal): Promise<SearchPage> => {
      const hits: MessageSearchHit[] = []
      let next = cursor
      let more = true
      for (let page = 0; page < MAX_PAGES_PER_CALL && more; page += 1) {
        const res = await api.get<PaginatedMessageSearch>('/messages/search', {
          params: { q, limit: PAGE_SIZE, ...(next ? { cursor: next } : {}) },
          signal,
        })
        hits.push(
          ...res.data.items.filter((item) => item.conversation?.id === conversationId),
        )
        next = res.data.nextCursor
        more = Boolean(res.data.hasMore && next)
      }
      return { hits, nextCursor: next, hasMore: more }
    },
    [conversationId],
  )

  useEffect(() => {
    if (!trimmed) {
      requestRef.current += 1
      setResults([])
      setNextCursor(null)
      setHasMore(false)
      setSearched(false)
      setError(null)
      setLoading(false)
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const page = await fetchHits(trimmed, null, controller.signal)
        if (requestRef.current !== requestId) return
        setResults(page.hits)
        setNextCursor(page.nextCursor)
        setHasMore(page.hasMore)
        setSearched(true)
      } catch (err) {
        if (requestRef.current !== requestId || controller.signal.aborted) return
        setError(apiErrorMessage(err, 'Could not search messages.'))
        setResults([])
        setSearched(true)
      } finally {
        if (requestRef.current === requestId) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, fetchHits])

  const loadMore = async () => {
    if (loadingMore || !nextCursor) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchHits(trimmed, nextCursor)
      setResults((prev) => {
        const seen = new Set(prev.map((hit) => hit.id))
        return [...prev, ...page.hits.filter((hit) => !seen.has(hit.id))]
      })
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load more results.'))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b p-3 sm:px-4">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages…"
            aria-label="Search messages in this conversation"
            autoComplete="off"
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close search"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground sm:px-4">
        Showing matches in this conversation.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!trimmed && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Search this conversation</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Find a message by its text. Matching ignores case and accents.
            </p>
          </div>
        )}

        {trimmed && loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
          </div>
        )}

        {trimmed && !loading && error && (
          <p className="px-3 py-10 text-center text-sm text-destructive">{error}</p>
        )}

        {trimmed && !loading && !error && searched && results.length === 0 && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            No messages in this conversation match “{trimmed}”.
          </div>
        )}

        {trimmed && !loading && !error && results.length > 0 && (
          <ul className="flex flex-col">
            {results.map((hit) => {
              const senderName = hit.sender.displayName || hit.sender.username
              return (
                <li key={hit.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onSelect(hit.id)}
                    className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <UserAvatar
                      name={senderName}
                      avatarUrl={hit.sender.avatarUrl}
                      size="sm"
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {senderName}
                          {hit.sender.id === meId && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              you
                            </span>
                          )}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {formatWhen(hit.createdAt)}
                        </span>
                      </span>
                      <span
                        dir={textDirection(messagePreview(hit))}
                        className="mt-0.5 line-clamp-3 block text-sm break-words text-muted-foreground"
                      >
                        {messagePreview(hit)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {trimmed && !loading && !error && hasMore && (
          <div className="flex justify-center p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Load more results
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
