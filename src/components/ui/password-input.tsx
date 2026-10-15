import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from 'cn'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Password field with a show/hide toggle.
 *
 * Wraps the shared `Input` so it keeps the app's field styling, and adds an
 * accessible toggle button (exposes its state via `aria-pressed`). Every other
 * prop — `id`, `value`, `onChange`, `autoComplete`, `aria-*` — passes through
 * unchanged.
 */
export function PasswordInput({ className, ...props }: React.ComponentProps<'input'>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pr-9', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}
