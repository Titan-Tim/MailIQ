'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Tenant { id: string; name: string; slug: string; brandColor: string; plan: string }
interface User   { id: string; email: string; name: string; role: string; tenant: Tenant }

interface AuthCtx {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const Ctx = createContext<AuthCtx>({ user: null, login: async () => {}, logout: () => {}, loading: true })

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('mailiq_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')
    localStorage.setItem('accessToken',  data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    localStorage.setItem('mailiq_user',  JSON.stringify(data.user))
    setUser(data.user)
  }

  function logout() {
    localStorage.clear()
    setUser(null)
    window.location.href = '/mail/login'
  }

  return <Ctx.Provider value={{ user, login, logout, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
