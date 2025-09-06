// Client-safe auth helpers (no server-only deps like bcrypt/prisma/crypto)
// Keep token helpers here for client code imports.
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (response.ok) {
      const data = await response.json()
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
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null }
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  }
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  const accessToken = localStorage.getItem('accessToken')
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
  if (typeof window === 'undefined') return null
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) return null
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.role
  } catch {
    return null
  }
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) return null
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.userId
  } catch {
    return null
  }
}
