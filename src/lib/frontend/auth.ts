// Lightweight in-memory auth token helper.
// Recommendation: move to HttpOnly secure cookies or platform auth SDK.
let tokenInMemory: string | null = null

export function setAuthToken(token: string | null) {
  tokenInMemory = token
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('auth:token', { detail: { token } }))
    } catch (_) {}
  }
}

export function getAuthToken(): string | null {
  if (tokenInMemory) return tokenInMemory

  return null
}

export function clearAuthToken() {
  tokenInMemory = null
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('auth:token', { detail: { token: null } }))
    } catch (_) {}
  }
}
