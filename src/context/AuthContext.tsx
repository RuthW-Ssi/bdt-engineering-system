import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { apiClient } from '../api/client'

export interface AuthUser {
  id: number
  login: string
  name: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (loginId: string, password: string) => Promise<AuthUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bdt_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('bdt_user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  })

  const login = useCallback(async (loginId: string, password: string) => {
    try {
      const res = await apiClient.post<{ access_token: string; user: AuthUser }>('/auth/login', {
        login: loginId,
        password,
      })
      const { access_token, user: authUser } = res.data
      localStorage.setItem('bdt_token', access_token)
      localStorage.setItem('bdt_user', JSON.stringify(authUser))
      setToken(access_token)
      setUser(authUser)
      return authUser
    } catch (err) {
      console.error('[auth] login failed:', err instanceof Error ? err.message : String(err))
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('bdt_token')
    localStorage.removeItem('bdt_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
