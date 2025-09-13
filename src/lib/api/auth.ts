// Client-safe auth helpers (no server-only deps like bcrypt/prisma/crypto)
// Keep token helpers here for client code imports.
import { getAuthToken, setAuthToken, clearAuthToken } from '@/lib/frontend/auth'

export async function refreshAccessToken(refreshToken?: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (refreshToken) headers['refresh-token'] = refreshToken
    const response = await fetch('/api/auth/refresh', { method: 'POST', headers })

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
  // Only use in-memory access token; refresh token is HttpOnly cookie (not accessible to JS)
  return { accessToken: getAuthToken(), refreshToken: null }
}

export function storeTokens(accessToken: string): void {
  setAuthToken(accessToken)
}

export function clearStoredTokens(): void {
  clearAuthToken()
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
