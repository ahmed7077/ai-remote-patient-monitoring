/* eslint-disable react-refresh/only-export-components */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { api } from './api'
import type { Role, User } from './types'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface RegisterData {
  full_name: string
  email: string
  password: string
  role: Role
}

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (data: RegisterData) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function dashboardFor(role: Role): string {
  return role === 'PATIENT' ? '/patient/dashboard' : '/doctor/dashboard'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(api.hasToken)
  const currentUser = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    enabled: hasToken,
    retry: false,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (hasToken && currentUser.isError) {
      api.logout()
      setHasToken(false)
      queryClient.removeQueries({ queryKey: ['me'] })
    }
  }, [currentUser.isError, hasToken, queryClient])

  async function login(email: string, password: string): Promise<User> {
    await api.login(email, password)
    const user = await api.me()
    queryClient.setQueryData(['me'], user)
    setHasToken(true)
    return user
  }

  async function register(data: RegisterData): Promise<User> {
    return api.register(data)
  }

  function logout(): void {
    api.logout()
    queryClient.removeQueries({ queryKey: ['me'] })
    setHasToken(false)
  }

  const status: AuthStatus = !hasToken
    ? 'unauthenticated'
    : currentUser.isPending
      ? 'loading'
      : currentUser.data
        ? 'authenticated'
        : 'unauthenticated'

  const value = { status, user: currentUser.data ?? null, login, register, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
