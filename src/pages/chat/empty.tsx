import { MessageSquare } from 'lucide-react'

export function ChatEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <MessageSquare className="h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-semibold">Welcome to Chatrix</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Select a conversation or search for a user to start chatting
      </p>
    </div>
  )
}
