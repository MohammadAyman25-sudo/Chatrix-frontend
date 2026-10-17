import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import type { AppSocket } from '@/lib/app-socket'
import { API_ORIGIN } from '@/lib/media'
import { USE_MOCK, MOCK_AUTO_REPLY } from '@/lib/mock/config'
import { createMockSocket } from '@/lib/mock/socket'
import { setAutoReply } from '@/lib/mock/client'
import { useAuth } from './auth-context'

type SocketContextType = {
  socket: AppSocket | null
  connected: boolean
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false })

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [socket, setSocket] = useState<AppSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (USE_MOCK) setAutoReply(MOCK_AUTO_REPLY)
  }, [])

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect()
      socketRef.current = null
      setSocket(null)
      setConnected(false)
      return
    }

    if (USE_MOCK) {
      const mock = createMockSocket()
      socketRef.current = mock
      setSocket(mock)
      setConnected(true)
      return () => {
        mock.disconnect()
        socketRef.current = null
        setSocket(null)
        setConnected(false)
      }
    }

    const s = io(API_ORIGIN, {
      withCredentials: true,
      transports: ['websocket'],
    })

    socketRef.current = s
    setSocket(s as unknown as AppSocket)

    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)

    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.disconnect()
      socketRef.current = null
      setSocket(null)
      setConnected(false)
    }
  }, [user])

  return (
    <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
