import { ArrowLeft, Info, Users } from 'lucide-react'
import { cn } from 'cn'
import type { Conversation } from '@/types/api'
import { otherParticipant } from '@/lib/conversations'
import { UserAvatar } from '@/components/chat/user-avatar'
import { Button } from '@/components/ui/button'

export function ConversationHeader({
  conversation,
  meId,
  connected,
  typingNames,
  recordingNames,
  presenceText,
  presenceOnline,
  infoActive,
  onOpenInfo,
  onBack,
}: {
  conversation: Conversation
  meId: string | undefined
  connected: boolean
  typingNames: string[]
  recordingNames: string[]
  /** Live online/last-seen text, used when nobody is typing or recording. */
  presenceText?: string | null
  presenceOnline?: boolean
  /** Highlighted state for the info/members toggle. */
  infoActive?: boolean
  onOpenInfo: () => void
  onBack: () => void
}) {
  const isGroup = conversation.type === 'group'
  const other = otherParticipant(conversation, meId)
  const title = isGroup
    ? conversation.name || 'Group'
    : other?.displayName || other?.username || 'Conversation'

  const recordingLabel =
    recordingNames.length > 1
      ? `${recordingNames.length} people are recording audio…`
      : recordingNames.length === 1
        ? `${recordingNames[0]} is recording audio…`
        : null

  const typingLabel =
    typingNames.length > 1
      ? `${typingNames.length} people are typing…`
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : null

  const fallbackSubtitle = isGroup
    ? `${conversation.participants.length} members`
    : other
      ? `@${other.username}`
      : connected
        ? 'Connected'
        : 'Offline'

  const subtitle = recordingLabel ?? typingLabel ?? presenceText ?? fallbackSubtitle

  return (
    <header className="flex items-center gap-2 border-b p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        aria-label="Back to conversations"
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <button
        type="button"
        onClick={onOpenInfo}
        className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        aria-label={isGroup ? 'Open group members' : 'View profile'}
      >
        <UserAvatar
          name={title}
          avatarUrl={isGroup ? conversation.avatarUrl : other?.avatarUrl}
          size="lg"
          status={isGroup ? undefined : other ? presenceOnline ? 'online' : 'offline' : undefined}
          fallback={isGroup ? <Users className="h-4 w-4" /> : undefined}
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p
            className={cn(
              'flex items-center gap-1.5 truncate text-xs',
              recordingLabel
                ? 'text-destructive'
                : typingLabel
                  ? 'text-primary'
                  : presenceOnline
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
            )}
          >
            {recordingLabel && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
            )}
            {subtitle}
          </p>
        </div>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('shrink-0', infoActive && 'bg-muted text-foreground')}
        aria-label={isGroup ? 'Toggle members panel' : 'View profile'}
        aria-pressed={isGroup ? infoActive : undefined}
        onClick={onOpenInfo}
      >
        {isGroup ? <Users className="h-5 w-5" /> : <Info className="h-5 w-5" />}
      </Button>
    </header>
  )
}
