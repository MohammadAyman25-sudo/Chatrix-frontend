import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { apiErrorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Status = 'verifying' | 'success' | 'error'

/**
 * Redeems the token from an email verification link.
 *
 * The backend accepts the token via `POST /auth/verify-email`. We read it from
 * `?token=` (and also support a `/verify-email/:token` path form).
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const params = useParams<{ token?: string }>()
  const token = searchParams.get('token') ?? params.token ?? ''
  const { verifyEmail, refresh, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')
  const [message, setMessage] = useState(
    token ? '' : 'This verification link is missing its token. Request a new one below.',
  )
  const [hasSession, setHasSession] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const verifyRef = useRef(verifyEmail)

  useEffect(() => {
    verifyRef.current = verifyEmail
  })

  useEffect(() => {
    if (!token || hasRun) return
    setHasRun(true)
    let cancelled = false
    ;(async () => {
      try {
        await verifyRef.current(token)
        if (cancelled) return
        // If the backend issued a session we can go straight in; otherwise sign in.
        const current = await refresh()
        if (cancelled) return
        setHasSession(Boolean(current))
        setStatus('success')
      } catch (err) {
        if (cancelled) return
        setMessage(apiErrorMessage(err, 'This verification link is invalid or has expired.'))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, hasRun, refresh])

  // Already signed in and verified? Skip the page entirely.
  useEffect(() => {
    if (!authLoading && user?.emailVerified && !token) navigate('/chat', { replace: true })
  }, [authLoading, user, token, navigate])

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {status === 'verifying' && (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {status === 'success' && (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}
          {status === 'error' && (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
          )}
          <CardTitle className="text-2xl">
            {status === 'verifying'
              ? 'Verifying your email…'
              : status === 'success'
                ? 'Email verified'
                : 'Verification failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === 'verifying' && (
            <p className="text-sm text-muted-foreground">Hang tight, this only takes a moment.</p>
          )}

          {status === 'success' && (
            <>
              <p className="text-sm text-muted-foreground">
                Your email is confirmed. {hasSession ? '' : 'You can now sign in.'}
              </p>
              <Button
                className="w-full"
                onClick={() => navigate(hasSession ? '/chat' : '/login', { replace: true })}
              >
                {hasSession ? 'Continue to Chatrix' : 'Go to login'}
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
              <Button className="w-full" variant="outline" onClick={() => navigate('/login')}>
                Back to login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
