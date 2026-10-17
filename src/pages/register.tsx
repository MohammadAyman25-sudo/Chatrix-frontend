import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Check, Circle, Loader2, MailCheck } from 'lucide-react'
import { cn } from 'cn'
import { useAuth } from '@/contexts/auth-context'
import { apiErrorMessage, apiFieldErrors } from '@/lib/errors'
import { PASSWORD_RULES, unmetPasswordRules } from '@/lib/password'
import { mockVerificationHref } from '@/lib/mock/client'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type FieldErrors = Partial<Record<'username' | 'email' | 'password' | 'confirmPassword', string>>

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  )
}

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [demoHref, setDemoHref] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resentMessage, setResentMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const { register, resendVerification } = useAuth()
  const navigate = useNavigate()

  const unmetRules = useMemo(() => unmetPasswordRules(password), [password])
  const ruleStatuses = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) })),
    [password],
  )

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!username.trim()) next.username = 'Username is required'
    if (!email.trim()) next.email = 'Email is required'
    if (!password) {
      next.password = 'Password is required'
    } else if (unmetRules.length > 0) {
      const first = unmetRules[0].label
      next.password = `Password must include ${first.charAt(0).toLowerCase()}${first.slice(1)}`
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeneralError('')

    const nextErrors = validate()
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }
    setFieldErrors({})

    setLoading(true)
    try {
      const result = await register(username.trim(), email.trim(), password, confirmPassword)
      if (result.emailVerificationSent) {
        setPendingEmail(result.email)
        setDemoHref(mockVerificationHref())
        return
      }
      navigate('/chat')
    } catch (error) {
      const serverFields = apiFieldErrors(error)
      setFieldErrors(serverFields)
      // Only surface a banner when there is nothing field-specific to show.
      setGeneralError(
        Object.keys(serverFields).length > 0 ? '' : apiErrorMessage(error, 'Registration failed'),
      )
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (!pendingEmail || resending) return
    setResending(true)
    setResendError('')
    setResentMessage('')
    try {
      const sent = await resendVerification(pendingEmail)
      setResentMessage(sent)
      setDemoHref(mockVerificationHref())
    } catch (error) {
      setResendError(apiErrorMessage(error, 'Could not resend the verification email.'))
    } finally {
      setResending(false)
    }
  }

  if (pendingEmail) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <MailCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              We sent a verification link to{' '}
              <span className="font-medium text-foreground">{pendingEmail}</span>. Open it to
              activate your account, then sign in.
            </p>
            <p className="text-xs text-muted-foreground">
              Can't find it? Check your spam folder before requesting another link.
            </p>
            {resentMessage && (
              <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                {resentMessage}
              </p>
            )}
            {resendError && (
              <p role="alert" className="text-sm text-destructive">
                {resendError}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void resend()}
              disabled={resending}
            >
              {resending && <Loader2 className="h-4 w-4 animate-spin" />}
              {resending ? 'Sending…' : 'Resend verification email'}
            </Button>
            {demoHref && (
              <p className="rounded-lg border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
                Mock mode — no real email is sent.{' '}
                <Link to={demoHref} className="font-medium text-foreground underline">
                  Open verification link
                </Link>
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Already verified?{' '}
              <Link to="/login" className="underline">
                Login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  clearFieldError('username')
                }}
                autoComplete="username"
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                required
              />
              <FieldError id="username-error" message={fieldErrors.username} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearFieldError('email')
                }}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                required
              />
              <FieldError id="email-error" message={fieldErrors.email} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearFieldError('password')
                  clearFieldError('confirmPassword')
                }}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby="password-requirements"
                required
              />
              <ul
                id="password-requirements"
                className="space-y-1"
                aria-label="Password requirements"
              >
                {ruleStatuses.map(({ rule, met }) => (
                  <li
                    key={rule.id}
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      met
                        ? 'text-emerald-600 dark:text-emerald-500'
                        : 'text-muted-foreground',
                    )}
                  >
                    {met ? (
                      <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{rule.label}</span>
                    <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
                  </li>
                ))}
              </ul>
              <FieldError id="password-error" message={fieldErrors.password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  clearFieldError('confirmPassword')
                }}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
                required
              />
              <FieldError id="confirmPassword-error" message={fieldErrors.confirmPassword} />
            </div>

            {generalError && (
              <p role="alert" className="text-sm text-destructive">
                {generalError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="underline">
                Login
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
