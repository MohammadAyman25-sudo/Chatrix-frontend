import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { apiErrorMessage } from '@/lib/errors'
import type { PublicUser } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

type Settings = PublicUser['settings']
type SettingKey = 'notifications' | 'readReceipts'

const SETTING_ROWS: Array<{
  key: SettingKey
  icon: typeof Bell
  title: string
  description: string
}> = [
  {
    key: 'notifications',
    icon: Bell,
    title: 'Email notifications',
    description: "Receive an email when someone messages you while you're offline.",
  },
  {
    key: 'readReceipts',
    icon: CheckCheck,
    title: 'Read receipts',
    description:
      "Let people you chat with see when you've read their messages. When this is off, your reads stay private and you keep seeing everyone else's receipts.",
  },
]

function patchFor(key: SettingKey, value: boolean): Partial<Settings> {
  return key === 'notifications' ? { notifications: value } : { readReceipts: value }
}

export function SettingsPage() {
  const { user, updateSettings } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // The signed-in user is the source of truth for the saved settings.
  const saved = user?.settings ?? null
  // Shown only while a change is in flight; the server's reply replaces it.
  const [optimistic, setOptimistic] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft: Settings | null = saving ? optimistic ?? saved : saved

  // Only accept in-app chat paths as the way back (the sidebar passes them).
  const from = location.state as { from?: unknown } | null
  const backTo =
    typeof from?.from === 'string' && from.from.startsWith('/chat') ? from.from : '/chat'

  const toggle = async (key: SettingKey, value: boolean) => {
    if (!saved || saving) return
    setOptimistic({ ...saved, [key]: value })
    setSaving(true)
    setError(null)
    try {
      await updateSettings(patchFor(key, value))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save this setting.'))
    } finally {
      setSaving(false)
      setOptimistic(null)
    }
  }

  if (!saved || !draft) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading settings…
      </div>
    )
  }

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to chat"
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        {SETTING_ROWS.map((row) => {
          const id = `setting-${row.key}`
          const Icon = row.icon
          return (
            <Card key={row.key}>
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id} className="gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {row.title}
                  </Label>
                  <p id={`${id}-description`} className="text-sm text-muted-foreground">
                    {row.description}
                  </p>
                </div>
                <Switch
                  id={id}
                  checked={draft[row.key]}
                  disabled={saving}
                  aria-describedby={`${id}-description`}
                  onCheckedChange={(value) => void toggle(row.key, value)}
                />
              </CardContent>
            </Card>
          )
        })}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground">Changes save automatically.</p>
      </main>
    </div>
  )
}
