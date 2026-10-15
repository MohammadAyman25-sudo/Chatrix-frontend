import { useMemo, useRef, useState } from 'react'
import { Camera, Check, Loader2, Mic, Pencil, Trash2, UserPlus, Users, X } from 'lucide-react'
import { cn } from 'cn'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/errors'
import type { Conversation, Participant } from '@/types/api'
import { presenceLabel } from '@/lib/presence'
import { usePresence } from '@/contexts/presence-context'
import { UserAvatar } from '@/components/chat/user-avatar'
import { InviteMembersDialog } from '@/components/chat/invite-members-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MAX_ICON_BYTES = 5 * 1024 * 1024

export function MemberPanel({
  conversation,
  meId,
  typingUserIds,
  recordingUserIds,
  onClose,
  onSelectMember,
  onConversationUpdated,
  className,
}: {
  conversation: Conversation
  meId?: string
  typingUserIds: string[]
  recordingUserIds: string[]
  onClose: () => void
  onSelectMember: (userId: string) => void
  onConversationUpdated: (conversation: Conversation) => void
  className?: string
}) {
  const { getPresence } = usePresence()
  const typing = useMemo(() => new Set(typingUserIds), [typingUserIds])
  const recording = useMemo(() => new Set(recordingUserIds), [recordingUserIds])

  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(conversation.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const isGroup = conversation.type === 'group'
  const groupName = conversation.name || 'Group'

  const members = useMemo(() => {
    const rank = (participant: Participant) => {
      if (participant.id === meId) return 0
      if (getPresence(participant.id)?.status === 'online') return 1
      return 2
    }
    return [...conversation.participants].sort((a, b) => {
      const delta = rank(a) - rank(b)
      if (delta !== 0) return delta
      const aName = (a.displayName || a.username).toLowerCase()
      const bName = (b.displayName || b.username).toLowerCase()
      return aName.localeCompare(bName)
    })
  }, [conversation.participants, meId, getPresence])

  const onlineCount = members.filter((m) => getPresence(m.id)?.status === 'online').length

  const startRename = () => {
    setNameDraft(conversation.name ?? '')
    setManageError(null)
    setRenaming(true)
  }

  const saveName = async () => {
    const name = nameDraft.trim()
    if (savingName) return
    if (!name || name === conversation.name) {
      setRenaming(false)
      return
    }
    setSavingName(true)
    setManageError(null)
    try {
      const res = await api.patch<{ conversation: Conversation }>(
        `/conversations/${conversation.id}`,
        { name },
      )
      onConversationUpdated(res.data.conversation)
      setRenaming(false)
    } catch (err) {
      setManageError(apiErrorMessage(err, 'Could not rename the group.'))
    } finally {
      setSavingName(false)
    }
  }

  const uploadIcon = async (file: File) => {
    if (file.size > MAX_ICON_BYTES) {
      setManageError('Group icon must be 5MB or smaller.')
      return
    }
    setIconBusy(true)
    setManageError(null)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await api.post<{ conversation: Conversation }>(
        `/conversations/${conversation.id}/avatar`,
        form,
      )
      onConversationUpdated(res.data.conversation)
    } catch (err) {
      setManageError(apiErrorMessage(err, 'Could not update the group icon.'))
    } finally {
      setIconBusy(false)
    }
  }

  const removeIcon = async () => {
    setIconBusy(true)
    setManageError(null)
    try {
      const res = await api.delete<{ conversation: Conversation }>(
        `/conversations/${conversation.id}/avatar`,
      )
      onConversationUpdated(res.data.conversation)
    } catch (err) {
      setManageError(apiErrorMessage(err, 'Could not remove the group icon.'))
    } finally {
      setIconBusy(false)
    }
  }

  return (
    <aside
      aria-label="Group members"
      className={cn('flex flex-col border-l bg-background shadow-xl md:shadow-none', className)}
    >
      <div className="flex items-center justify-between gap-2 border-b p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 md:pt-3">
        <h2 className="text-sm font-semibold">{isGroup ? 'Group info' : 'Members'}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close members panel"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b p-3 sm:px-4">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <UserAvatar
              name={groupName}
              avatarUrl={conversation.avatarUrl}
              size="lg"
              fallback={<Users className="h-6 w-6" />}
            />
            {isGroup && (
              <>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void uploadIcon(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={iconBusy}
                  aria-label="Change group icon"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                >
                  {iconBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </button>
              </>
            )}
          </div>

          {isGroup && renaming ? (
            <form
              className="mt-3 flex w-full items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                void saveName()
              }}
            >
              <Input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label="Group name"
                maxLength={60}
                autoFocus
              />
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Save name"
                disabled={savingName || !nameDraft.trim()}
              >
                {savingName ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancel rename"
                onClick={() => setRenaming(false)}
                disabled={savingName}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="mt-3 flex items-center gap-1.5">
              <h3 className="max-w-[12rem] truncate text-base font-semibold">{groupName}</h3>
              {isGroup && (
                <button
                  type="button"
                  onClick={startRename}
                  aria-label="Rename group"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <p className="mt-0.5 text-xs text-muted-foreground">
            {conversation.participants.length} members
            {onlineCount > 0 ? ` · ${onlineCount} online` : ''}
          </p>

          {isGroup && conversation.avatarUrl && (
            <button
              type="button"
              onClick={() => void removeIcon()}
              disabled={iconBusy}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Remove icon
            </button>
          )}
        </div>

        {isGroup && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Add members
          </Button>
        )}

        {manageError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {manageError}
          </p>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {members.map((member) => {
          const isMe = member.id === meId
          const name = member.displayName || member.username
          const isRecording = recording.has(member.id)
          const isTyping = typing.has(member.id)
          const online = getPresence(member.id)?.status === 'online'
          const statusText = isRecording
            ? 'Recording audio…'
            : isTyping
              ? 'Typing…'
              : (presenceLabel(getPresence(member.id), isMe) ?? 'Offline')

          return (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onSelectMember(member.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <UserAvatar
                  name={name}
                  avatarUrl={member.avatarUrl}
                  status={getPresence(member.id)?.status}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    {isMe && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        you
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-1 truncate text-xs',
                      isRecording
                        ? 'text-destructive'
                        : isTyping
                          ? 'text-primary'
                          : online
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground',
                    )}
                  >
                    {isRecording && <Mic className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    {statusText}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {isGroup && (
        <InviteMembersDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          conversation={conversation}
          onUpdated={onConversationUpdated}
        />
      )}
    </aside>
  )
}
