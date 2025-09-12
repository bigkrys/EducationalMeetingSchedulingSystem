// Lightweight in-memory auth token helper.
// Recommendation: move to HttpOnly secure cookies or platform auth SDK.
let tokenInMemory: string | null = null

export function setAuthToken(token: string | null) {
  tokenInMemory = token
}

export function getAuthToken(): string | null {
  if (tokenInMemory) return tokenInMemory

  // Backwards-compat: fall back to localStorage if present, but warn.
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('accessToken')
    if (t) {
      // eslint-disable-next-line no-console
      console.warn(
        '[auth] using accessToken from localStorage — consider switching to HttpOnly secure cookies or in-memory token via setAuthToken()'
      )
      tokenInMemory = t
      return t
    }
  }

  return null
}

export function clearAuthToken() {
  tokenInMemory = null
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('accessToken')
      // keep refreshToken handling to app auth flow if desired
    } catch (_) {}
  }
}
