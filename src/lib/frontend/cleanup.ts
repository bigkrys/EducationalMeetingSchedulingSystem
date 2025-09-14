import { clearAuthToken } from '@/lib/frontend/auth'
import { clearUserCache } from '@/lib/api/user-service'
import { resetSessionLocal } from '@/lib/frontend/session-store'

export function clearAllClientCaches() {
  try {
    clearAuthToken()
  } catch {}
  try {
    clearUserCache()
  } catch {}
  try {
    resetSessionLocal()
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear()
      } catch {}
      try {
        localStorage.clear()
      } catch {}
    }
  } catch {}
}
