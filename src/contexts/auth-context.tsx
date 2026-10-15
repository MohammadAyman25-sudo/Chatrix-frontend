import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import api from '@/lib/api'
import type { PublicUser, RegisterResponse } from '@/types/api'

export type RegisterResult = {
  /** True when the account must be verified before it can sign in. */
  emailVerificationSent: boolean
  email: string
}

type AuthContextType = {
  user: PublicUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<RegisterResult>
  logout: () => Promise<void>
  /** Reloads `GET /auth/me`; returns the user when a session exists. */
  refresh: () => Promise<PublicUser | null>
  /** Redeems an email verification token. Returns the verified user. */
  verifyEmail: (token: string) => Promise<PublicUser>
  /** Requests a fresh verification link (always succeeds, to avoid enumeration). */
  resendVerification: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async (): Promise<PublicUser | null> => {
    try {
      const res = await api.get<{ user: PublicUser }>('/auth/me')
      setUser(res.data.user)
      return res.data.user
    } catch {
      setUser(null)
      return null
    }
  }

  useEffect(() => {
    ;(async () => {
      await refresh()
      setLoading(false)
    })()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await api.post<{ user: PublicUser }>('/auth/login', { email, password })
    setUser(res.data.user)
  }

  const register = async (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ): Promise<RegisterResult> => {
    const res = await api.post<RegisterResponse>('/auth/register', {
      username,
      email,
      password,
      confirmPassword,
    })
    const emailVerificationSent = Boolean(res.data.emailVerificationSent)
    // With verification on, no session is created until the email is confirmed.
    if (!emailVerificationSent) setUser(res.data.user)
    return { emailVerificationSent, email }
  }

  const verifyEmail = async (token: string): Promise<PublicUser> => {
    const res = await api.post<{ user: PublicUser }>('/auth/verify-email', { token })
    return res.data.user
  }

  const resendVerification = async (email: string): Promise<void> => {
    await api.post('/auth/resend-verification', { email })
  }

  const logout = async () => {
    await api.post('/auth/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, verifyEmail, resendVerification }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
