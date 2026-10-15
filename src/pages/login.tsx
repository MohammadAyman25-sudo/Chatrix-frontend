import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { apiErrorMessage, isEmailNotVerifiedError } from '@/lib/errors'
import { mockVerificationHref } from '@/lib/mock/client'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState('')
  const [demoHref, setDemoHref] = useState<string | null>(null)
  const { login, resendVerification } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNeedsVerification(false)
    setResent(false)
    setResendError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/chat')
    } catch (err) {
      setError(apiErrorMessage(err, 'Login failed. Check your email and password.'))
      setNeedsVerification(isEmailNotVerifiedError(err))
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (!email.trim() || resending) return
    setResending(true)
    setResendError('')
    setResent(false)
    try {
      await resendVerification(email.trim())
      setResent(true)
      setDemoHref(mockVerificationHref())
    } catch (err) {
      setResendError(apiErrorMessage(err, 'Could not resend the verification email.'))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {needsVerification && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MailCheck className="h-3.5 w-3.5 shrink-0" />
                  Didn't get the email? We can send a new verification link.
                </p>
                {resent && (
                  <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
                    Verification email sent to {email.trim()}.
                  </p>
                )}
                {resendError && (
                  <p role="alert" className="text-xs text-destructive">
                    {resendError}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void resend()}
                  disabled={resending || !email.trim()}
                >
                  {resending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {resending ? 'Sending…' : 'Resend verification email'}
                </Button>
                {demoHref && (
                  <p className="text-xs text-muted-foreground">
                    Mock mode —{' '}
                    <Link to={demoHref} className="font-medium text-foreground underline">
                      open the verification link
                    </Link>
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Logging in…' : 'Login'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/register" className="underline">
                Register
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
