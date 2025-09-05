import { NextResponse, NextRequest } from 'next/server'

// Minimal runtime CORS + security headers + requestId

function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (process.env.NEXT_PUBLIC_APP_URL) allowed.push(process.env.NEXT_PUBLIC_APP_URL)
  const isAllowed = allowed.length > 0 && allowed.includes(origin)

  const headers: Record<string, string> = {}
  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-request-id'
  }
  return headers
}

function securityHeaders() {
  const h: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  }
  // HSTS (only meaningful over HTTPS)
  h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
  return h
}

export function middleware(req: NextRequest) {
  // Only apply to API routes for CORS
  const isApi = req.nextUrl.pathname.startsWith('/api/')

  // Ensure request-id exists and propagate to downstream
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', reqId)

  const res = NextResponse.next({ request: { headers: requestHeaders } })

  // Always include request id and security headers in response
  res.headers.set('x-request-id', reqId)
  for (const [k, v] of Object.entries(securityHeaders())) res.headers.set(k, v)

  if (isApi) {
    const cors = buildCorsHeaders(req)
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: res.headers })
    }
  }

  return res
}

export const config = {
  matcher: ['/api/:path*']
}

