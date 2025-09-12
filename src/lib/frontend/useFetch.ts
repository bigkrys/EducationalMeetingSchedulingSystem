import { useCallback } from 'react'
import { getAuthToken } from './auth'
import { showErrorMessage } from '@/lib/api/global-error-handler'
import router from 'next/router'
type FetchOptions = RequestInit & { jsonBody?: any }

export async function fetchWithAuth(url: string, options: FetchOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  const token = getAuthToken()
  if (!token) {
    showErrorMessage('请先登录')
    router.push('/login')
    return { res: new Response(null, { status: 401 }), json: null }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const init: RequestInit = {
    method: options.method || 'GET',
    ...options,
    headers,
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
