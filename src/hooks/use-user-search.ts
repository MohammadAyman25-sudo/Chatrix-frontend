import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { UserSummary } from '@/types/api'
import { useAuth } from '@/contexts/auth-context'

type UseUserSearchResult = {
  results: UserSummary[]
  loading: boolean
  error: string | null
}

/**
 * Debounced search against `GET /users/search?q=&limit=`.
 * The endpoint excludes the caller, but we filter again defensively.
 */
export function useUserSearch(
  query: string,
  { limit = 20, debounceMs = 250 }: { limit?: number; debounceMs?: number } = {},
): UseUserSearchResult {
  const [results, setResults] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<UserSummary[]>('/users/search', {
          params: { q: trimmed, limit },
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setResults(res.data.filter((u) => u.id !== user?.id))
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (name === 'CanceledError' || name === 'AbortError') return
        setError(apiErrorMessage(err, 'Could not search right now.'))
        setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, limit, debounceMs, user?.id])

  return { results, loading, error }
}
