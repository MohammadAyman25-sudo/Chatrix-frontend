import { useState } from 'react'
import { Loader2, LogOut, MailCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { apiErrorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Full-screen gate for a signed-in account whose email is not verified.
 *
 * The backend refuses `POST /auth/login` (403) until the address is confirmed,
 * so this covers the edge case of an existing session that predates a change to
 * the verification requirement. Verification is mandatory to use the app.
 */
export function VerifyEmailGate() {
  const { user, resendVerification, logout } = useAuth()
  const [sending, setSending] = useState(false)
  const [sentMessage, setSentMessage] = useState('')
  const [error, setError] = useState('')

  const resend = async () => {
    if (!user || sending) return
    setSending(true)
    setError('')
    setSentMessage('')
    try {
      const sent = await resendVerification(user.email)
      setSentMessage(sent)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the verification email.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            You need to verify your email before you can use Chatrix. We sent a link to{' '}
            <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
          {sentMessage && (
            <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
              {sentMessage}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" onClick={() => void resend()} disabled={sending}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {sending ? 'Sending…' : 'Resend verification email'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
