import { NextResponse } from 'next/server'

export function ok<T extends Record<string, any>>(data?: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...(data || {}) }, init)
}

export function fail(message: string, status = 400, error?: string, details?: any) {
  const code = error || 'ERROR'
  return NextResponse.json({ ok: false, error: code, code, message, details }, { status })
}
