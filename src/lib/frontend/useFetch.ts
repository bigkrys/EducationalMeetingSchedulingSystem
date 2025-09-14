import { useCallback } from 'react'
import { showErrorMessage } from '@/lib/api/global-error-handler'
type FetchOptions = RequestInit & { jsonBody?: any }

export async function fetchWithAuth(url: string, options: FetchOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  const init: RequestInit = {
    method: options.method || 'GET',
    ...options,
    headers,
    credentials: 'include',
  }

  if (options.jsonBody !== undefined) {
    init.body = JSON.stringify(options.jsonBody)
  }

  const res = await fetch(url, init)
  const text = await res.text().catch(() => '')
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // non-json response
  }

  return { res, json }
}

export function useFetch() {
  const wrapped = useCallback(
    (url: string, options: FetchOptions = {}) => fetchWithAuth(url, options),
    []
  )
  return { fetchWithAuth: wrapped }
}
