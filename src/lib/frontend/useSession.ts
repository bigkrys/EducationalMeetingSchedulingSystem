import { useEffect, useState, useCallback } from 'react'
import { getSession, mutateSession, subscribe, SessionData } from './session-store'

export function useSession() {
  const [data, setData] = useState<SessionData | null>(() => getSession())
  const [loading, setLoading] = useState(!data)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const d = await mutateSession()
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!data) {
      refresh()
    }
    const unsub = subscribe(() => setData(getSession()))
    return unsub
  }, [])

  return { data, loading, refresh }
}
