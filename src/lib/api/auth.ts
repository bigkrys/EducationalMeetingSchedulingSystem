// Client-safe auth helpers (no server-only deps like bcrypt/prisma/crypto)
// Keep token helpers here for client code imports.
import { getAuthToken, setAuthToken, clearAuthToken } from '@/lib/frontend/auth'

export async function refreshAccessToken(refreshToken?: string): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    })

    if (response.ok) {
      const data = await response.json()
      if (data?.accessToken) setAuthToken(data.accessToken)
      return data.accessToken
    }
    return null
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

export function isTokenExpiringSoon(token: string): boolean {
  try {
    const decoded = JSON.parse(atob(token.split('.')[1]))
    const expirationTime = decoded.exp * 1000
    const currentTime = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    return expirationTime - currentTime < fiveMinutes
  } catch (error) {
    return true
  }
}

export function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  return {
    accessToken: getAuthToken(),
    refreshToken: typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null,
  }
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  setAuthToken(accessToken)
  if (typeof window !== 'undefined' && refreshToken) {
    try {
      localStorage.setItem('refreshToken', refreshToken)
    } catch (_) {}
  }
}

export function clearStoredTokens(): void {
  clearAuthToken()
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('refreshToken')
    } catch (_) {}
  }
}

export function isAuthenticated(): boolean {
  const accessToken = getAuthToken()
  if (!accessToken) return false
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    const currentTime = Date.now() / 1000
    return decoded.exp > currentTime
  } catch (error) {
    return false
  }
}

export function getCurrentUserRole(): string | null {
  const accessToken = getAuthToken()
  if (!accessToken) return null
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.role
  } catch {
    return null
  }
}

export function getCurrentUserId(): string | null {
  const accessToken = getAuthToken()
  if (!accessToken) return null
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.userId
  } catch {
    return null
  }
}
