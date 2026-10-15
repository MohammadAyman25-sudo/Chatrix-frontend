/**
 * Helpers for the API error shape documented in API_EXAMPLES.md:
 * `{ message, issues?: [{ code, path, message }] }`.
 * A legacy `{ error }` form is also tolerated.
 */

type ApiIssue = { code?: unknown; path?: unknown; message?: unknown }

type ApiErrorData = {
  message?: unknown
  error?: unknown
  issues?: ApiIssue[]
}

function apiErrorData(error: unknown): ApiErrorData | undefined {
  return (error as { response?: { data?: ApiErrorData } })?.response?.data
}

/** A single human-readable message, preferring `message` and folding in `issues`. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = apiErrorData(error)
  if (data) {
    if (typeof data.message === 'string' && data.message) return data.message
    if (typeof data.error === 'string' && data.error) return data.error
    const details = issueMessages(data.issues)
    if (details.length > 0) return details.join(' ')
  }
  return fallback
}

/**
 * Maps validation issues to `{ [field]: message }` using the first segment of
 * each issue's `path` (e.g. `path: ['password']` -> `{ password: '...' }`).
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  const data = apiErrorData(error)
  const fields: Record<string, string> = {}
  if (!data || !Array.isArray(data.issues)) return fields

  for (const issue of data.issues) {
    const message = typeof issue?.message === 'string' ? issue.message : null
    const field = Array.isArray(issue?.path) && typeof issue.path[0] === 'string' ? issue.path[0] : null
    if (message && field && !fields[field]) fields[field] = message
  }
  return fields
}

function issueMessages(issues: ApiIssue[] | undefined): string[] {
  if (!Array.isArray(issues)) return []
  return issues
    .map((issue) => (typeof issue?.message === 'string' ? issue.message : null))
    .filter((value): value is string => Boolean(value))
}

/**
 * `POST /auth/login` returns `403` while the account's email is unverified
 * (see API_EXAMPLES.md). Detect that case so the form can offer a resend.
 */
export function isEmailNotVerifiedError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status !== 403) return false
  const message = apiErrorMessage(error, '')
  return /not verified|verify your email/i.test(message)
}
