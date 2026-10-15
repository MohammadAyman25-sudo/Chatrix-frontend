import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😄', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩', '🥳', '🤔',
      '🙃', '😉', '😢', '😭', '😡', '🥺', '😴', '🤯', '😱', '😅', '🙄', '😬',
      '🤗', '🤭', '🫠', '🤫', '😇', '🥰',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '🙌', '👏', '🙏', '💪', '🤙', '✌️', '🤞', '🫶', '👋',
      '🖐️', '🫡', '🤌', '🤝', '👀', '🧠',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💖',
      '💗', '💘', '💝', '💞',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🎉', '🔥', '✨', '⭐', '💯', '✅', '❌', '⚠️', '📎', '📷', '🎤', '🎬',
      '💡', '📌', '🔔', '📝', '🚀', '🎨', '🎧', '📅',
    ],
  },
  {
    label: 'Food',
    emojis: [
      '☕', '🍕', '🍔', '🍟', '🍰', '🍩', '🍎', '🍉', '🍻', '🥂', '🍷', '🍜',
      '🍣', '🍦', '🥐', '🍪',
    ],
  },
]

type EmojiPickerProps = {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Insert emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Smile className="h-5 w-5" />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="absolute bottom-full left-0 z-40 mb-2 w-[calc(100vw-4rem)] max-w-xs rounded-xl border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
        >
          <div className="max-h-64 overflow-y-auto p-3">
            {EMOJI_GROUPS.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <h3 className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </h3>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSelect(emoji)
                        setOpen(false)
                      }}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none',
                        'transition-transform hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-90',
                      )}
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
