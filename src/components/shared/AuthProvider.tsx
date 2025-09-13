'use client'

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { setAuthToken, clearAuthToken, getAuthToken } from '@/lib/frontend/auth'
import { refreshAccessToken } from '@/lib/api/auth'
import { mutateSession } from '@/lib/frontend/session-store'

type AuthState = {
  accessToken: string | null
  role: string | null
  userId: string | null
  loading: boolean
  refresh: () => Promise<void>
  clear: () => void
}

const AuthCtx = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const parseToken = (token: string | null) => {
    if (!token) {
      setRole(null)
      setUserId(null)
      return
    }
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]))
      setRole(decoded.role || null)
      setUserId(decoded.userId || null)
    } catch {
      setRole(null)
      setUserId(null)
    }
  }

  const refresh = async () => {
    const newToken = await refreshAccessToken()
    if (newToken) {
      setAuthToken(newToken)
      setAccessToken(newToken)
      parseToken(newToken)
      try {
        await mutateSession()
      } catch {}
    } else {
      clearAuthToken()
      setAccessToken(null)
      setRole(null)
      setUserId(null)
      try {
        await mutateSession()
      } catch {}
    }
  }

  const clear = () => {
    clearAuthToken()
    setAccessToken(null)
    setRole(null)
    setUserId(null)
  }

  useEffect(() => {
    ;(async () => {
      try {
        await refresh()
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    const t = getAuthToken()
    if (t) {
      setAccessToken(t)
      parseToken(t)
      setLoading(false)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ accessToken, role, userId, loading, refresh, clear }),
    [accessToken, role, userId, loading]
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
