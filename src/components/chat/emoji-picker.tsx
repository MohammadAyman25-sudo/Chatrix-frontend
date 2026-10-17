import { useEffect, useRef, useState } from 'react'
import { Smile, X } from 'lucide-react'
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
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
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
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Emoji</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Close emoji picker"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
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
                      // Stay open so the same emoji can be inserted repeatedly.
                      onClick={() => onSelect(emoji)}
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
