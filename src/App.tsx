import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/auth-context'
import { SocketProvider } from '@/contexts/socket-context'
import { PresenceProvider } from '@/contexts/presence-context'
import { ThemeProvider } from '@/components/theme-provider'
import { RequireAuth } from '@/components/require-auth'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'
import { VerifyEmailPage } from '@/pages/verify-email'
import { ChatLayout } from '@/pages/chat/layout'
import { ChatEmpty } from '@/pages/chat/empty'
import { ChatRoom } from '@/pages/chat/room'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="chatrix-theme">
      <AuthProvider>
        <SocketProvider>
          <PresenceProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
              <Route
                path="/chat"
                element={
                  <RequireAuth>
                    <ChatLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<ChatEmpty />} />
                <Route path=":conversationId" element={<ChatRoom />} />
              </Route>
              <Route path="/" element={<Navigate to="/chat" replace />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </PresenceProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
