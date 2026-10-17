import { useEffect, useRef, useState } from 'react'
import { AtSign, CalendarDays, Loader2, Mail, Pencil, Trash2, Upload, X } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { UserSummary } from '@/types/api'
import { AVATAR_MAX_BYTES } from '@/lib/media'
import { uploadAvatar as uploadAvatarRequest } from '@/lib/uploads'
import { presenceLabel } from '@/lib/presence'
import { useAuth } from '@/contexts/auth-context'
import { usePresence } from '@/contexts/presence-context'
import { UserAvatar } from '@/components/chat/user-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

function formatJoined(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export function ProfileDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
}) {
  const { user, refresh } = useAuth()
  const { getPresence } = usePresence()
  const isSelf = Boolean(user && userId && userId === user.id)

  const [profile, setProfile] = useState<UserSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    if (saving || avatarBusy) return
    onOpenChange(false)
  }

  // Load another user's public profile (self comes from the auth context).
  useEffect(() => {
    if (!open || !userId || isSelf) {
      setProfile(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setProfile(null)
    ;(async () => {
      try {
        const res = await api.get<{ user: UserSummary }>(`/users/${userId}`)
        if (!cancelled) setProfile(res.data.user)
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, 'Could not load this profile.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId, isSelf])

  // Sync the edit form with the signed-in user whenever the dialog opens.
  useEffect(() => {
    setEditing(false)
    setSaveError(null)
    setDisplayName(user?.displayName ?? '')
    setBio(user?.bio ?? '')
  }, [open, userId, user])

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !avatarBusy) onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, saving, avatarBusy, onOpenChange])

  if (!open || !userId) return null

  const target = isSelf ? user : profile
  const name = target ? target.displayName || target.username : ''
  const statusText = presenceLabel(getPresence(userId), isSelf)
  const joined = isSelf ? formatJoined(user?.createdAt) : null

  const save = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.patch('/users/me', { displayName: displayName.trim(), bio: bio.trim() })
      await refresh()
      setEditing(false)
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save your profile.'))
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    if (file.size > AVATAR_MAX_BYTES) {
      setSaveError('Avatar must be 5MB or smaller.')
      return
    }
    setAvatarBusy(true)
    setSaveError(null)
    try {
      // Direct-to-R2: sign → PUT → confirm (no multipart). The confirm response
      // carries the updated user, so no extra `/auth/me` round trip is needed.
      await uploadAvatarRequest(file)
      await refresh()
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not update your avatar.'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const removeAvatar = async () => {
    setAvatarBusy(true)
    setSaveError(null)
    try {
      await api.delete('/users/me/avatar')
      await refresh()
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not remove your avatar.'))
    } finally {
      setAvatarBusy(false)
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm sm:pt-[12vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isSelf ? 'Your profile' : `${name}'s profile`}
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative h-24 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={close}
            disabled={saving || avatarBusy}
            className="absolute right-3 top-3 bg-background/70 backdrop-blur"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <UserAvatar
              name={name || '?'}
              avatarUrl={target?.avatarUrl}
              size="lg"
              status={getPresence(userId)?.status}
              className="size-20 ring-4 ring-card"
              viewable
            />
            {isSelf && (
              <div className="mb-1 flex items-center gap-1.5">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void uploadAvatar(file)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Photo
                </Button>
                {user?.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove avatar"
                    onClick={() => void removeAvatar()}
                    disabled={avatarBusy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : !target ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Profile unavailable.</p>
          ) : editing ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-display-name">Display name</Label>
                <Input
                  id="profile-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={target.username}
                  maxLength={50}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Say something about yourself"
                  maxLength={200}
                  className="min-h-20"
                />
              </div>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setSaveError(null)
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void save()} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{name}</h2>
                  <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    <AtSign className="h-3.5 w-3.5" />
                    {target.username}
                    {isSelf && <span className="ml-1 text-xs">(you)</span>}
                  </p>
                  {statusText && (
                    <p
                      className={cn(
                        'mt-1 text-xs font-medium',
                        getPresence(userId)?.status === 'online'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {statusText}
                    </p>
                  )}
                </div>
                {isSelf && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    disabled={avatarBusy}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground">About</h3>
                  <p className="mt-1 text-sm">
                    {target.bio?.trim() ? target.bio : 'No bio yet.'}
                  </p>
                </section>

                {isSelf && user && (
                  <section>
                    <h3 className="text-xs font-medium text-muted-foreground">Email</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {user.email}
                    </p>
                  </section>
                )}

                {joined && (
                  <section>
                    <h3 className="text-xs font-medium text-muted-foreground">Joined</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {joined}
                    </p>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
