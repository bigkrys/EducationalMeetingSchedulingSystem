import { ok } from '@/lib/api/response'

export type SessionData = {
  ok: boolean
  loggedIn: boolean
  user?: { id: string; email: string; role: string; name?: string | null }
  exp?: number | null
}

let current: SessionData | null = null
const listeners = new Set<() => void>()
const channel = typeof window !== 'undefined' ? new BroadcastChannel('SESSION') : null

if (channel) {
  channel.onmessage = (ev) => {
    if (ev?.data?.type === 'SESSION_UPDATED') {
      void mutateSession()
    } else if (ev?.data?.type === 'SESSION_CLEARED') {
      current = null
      notify()
    }
  }
}

export function getSession(): SessionData | null {
  return current
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  for (const fn of listeners) fn()
}

export async function fetchSession(): Promise<SessionData> {
  const res = await fetch('/api/session', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-store' },
  })
  const json = await res.json().catch(() => ({ ok: false, loggedIn: false }))
  current = json
  notify()
  return json
}

export async function mutateSession(): Promise<SessionData> {
  const data = await fetchSession()
  try {
    channel?.postMessage({ type: 'SESSION_UPDATED' })
  } catch {}
  return data
}

export function resetSessionLocal() {
  current = null
  notify()
  try {
    channel?.postMessage({ type: 'SESSION_CLEARED' })
  } catch {}
}
