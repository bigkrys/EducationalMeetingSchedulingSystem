import { NextResponse, NextRequest, NextFetchEvent } from 'next/server'
import { get as getEdgeConfig } from '@vercel/edge-config'

type ReleaseChannel = 'stable' | 'canary'

type CanaryEdgeConfig = {
  enabled?: boolean
  rolloutPct?: number
  rolloutPercentage?: number
  releaseId?: string
  rewritePrefix?: string | null
  userAllowlist?: string[]
  userBlocklist?: string[]
  forceVariant?: ReleaseChannel | null
  identityCookie?: string
  variantCookie?: string
  headers?: {
    release?: string
    releaseId?: string
  }
}

type ReleaseDecision = {
  variant: ReleaseChannel
  releaseId: string
  identity: string
  shouldSetIdentity: boolean
  variantCookieValue: string
  variantCookieName: string
  identityCookieName: string
}

const EDGE_CONFIG_KEY = 'canary_config'
const DEFAULT_IDENTITY_COOKIE = 'edu_uid'
const DEFAULT_VARIANT_COOKIE = 'edu_release'
const DEFAULT_RELEASE_ID = 'main'

// Minimal runtime CORS + security headers + requestId

function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
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
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
  // HSTS (only meaningful over HTTPS)
  h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
  return h
}

function hash(str: string) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
  return Math.abs(h) >>> 0
}

function decodeJwtUserId(token?: string | null): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = base64UrlDecode(parts[1])
    const json = JSON.parse(payload)
    return typeof json?.userId === 'string' ? json.userId : null
  } catch {
    return null
  }
}

function base64UrlDecode(input: string): string {
  const base = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (base.length % 4 || 4)) % 4
  const normalized = base + '='.repeat(padding)
  if (typeof atob === 'function') return atob(normalized)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf-8')
  }
  throw new Error('No base64 decoder available in this runtime')
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

function parseConfig(raw: unknown): CanaryEdgeConfig {
  if (!raw || typeof raw !== 'object') return {}
  const data = raw as Record<string, unknown>
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
    rolloutPct:
      typeof data.rolloutPct === 'number'
        ? data.rolloutPct
        : typeof data.rolloutPercentage === 'number'
          ? data.rolloutPercentage
          : undefined,
    rolloutPercentage: undefined,
    releaseId: typeof data.releaseId === 'string' ? data.releaseId : undefined,
    rewritePrefix: typeof data.rewritePrefix === 'string' ? data.rewritePrefix : null,
    userAllowlist: coerceStringArray(data.userAllowlist),
    userBlocklist: coerceStringArray(data.userBlocklist),
    forceVariant:
      data.forceVariant === 'canary' || data.forceVariant === 'stable'
        ? (data.forceVariant as ReleaseChannel)
        : null,
    identityCookie: typeof data.identityCookie === 'string' ? data.identityCookie : undefined,
    variantCookie: typeof data.variantCookie === 'string' ? data.variantCookie : undefined,
    headers:
      data.headers && typeof data.headers === 'object'
        ? {
            release:
              typeof (data.headers as any).release === 'string'
                ? (data.headers as any).release
                : undefined,
            releaseId:
              typeof (data.headers as any).releaseId === 'string'
                ? (data.headers as any).releaseId
                : undefined,
          }
        : undefined,
  }
}

function decideRelease(req: NextRequest, config: CanaryEdgeConfig): ReleaseDecision {
  const identityCookieName = config.identityCookie || DEFAULT_IDENTITY_COOKIE
  const variantCookieName = config.variantCookie || DEFAULT_VARIANT_COOKIE
  const releaseId = config.releaseId || DEFAULT_RELEASE_ID

  const identityCookie = req.cookies.get(identityCookieName)?.value
  let identity = identityCookie
  let shouldSetIdentity = false
  if (!identity) {
    identity = crypto.randomUUID()
    shouldSetIdentity = true
  }

  const accessToken = req.cookies.get('accessToken')?.value
  const tokenUserId = decodeJwtUserId(accessToken)
  const headerUserId = req.headers.get('x-user-id')
  const userId = tokenUserId || (headerUserId ? headerUserId.trim() : '') || identity

  const allowlist = new Set(config.userAllowlist || [])
  const blocklist = new Set(config.userBlocklist || [])

  const forced = config.forceVariant

  const cookieVariantRaw = req.cookies.get(variantCookieName)?.value
  let cookieVariant: ReleaseChannel | null = null
  if (cookieVariantRaw) {
    const [variantPart, releasePart] = cookieVariantRaw.split(':')
    if ((variantPart === 'canary' || variantPart === 'stable') && releasePart === releaseId) {
      cookieVariant = variantPart
    }
  }

  let variant: ReleaseChannel = 'stable'

  if (forced) {
    variant = forced
  } else if (allowlist.has(userId)) {
    variant = 'canary'
  } else if (blocklist.has(userId)) {
    variant = 'stable'
  } else if (cookieVariant) {
    variant = cookieVariant
  } else {
    const pct = Math.max(0, Math.min(100, config.rolloutPct ?? 0))
    const bucket = hash(userId) % 100
    variant = bucket < pct ? 'canary' : 'stable'
  }

  const variantCookieValue = `${variant}:${releaseId}`

  return {
    variant,
    releaseId,
    identity,
    shouldSetIdentity,
    variantCookieValue,
    variantCookieName,
    identityCookieName,
  }
}

export async function middleware(req: NextRequest, _evt?: NextFetchEvent) {
  const isApi = req.nextUrl.pathname.startsWith('/api/')

  // Ensure request-id exists and propagate to downstream
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', reqId)

  // Canary decision (defaults to stable when disabled or config missing)
  let releaseDecision: ReleaseDecision | null = null
  let parsedConfig: CanaryEdgeConfig | undefined

  // Only apply canary logic in production deployments
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
  const isProdEnv = vercelEnv ? vercelEnv === 'production' : process.env.NODE_ENV === 'production'

  if (isProdEnv) {
    if (!process.env.EDGE_CONFIG) {
      // In production without EDGE_CONFIG, proceed without canary
    } else {
      try {
        const rawConfig = await getEdgeConfig(EDGE_CONFIG_KEY)
        parsedConfig = parseConfig(rawConfig)
        const enabled = parsedConfig.enabled !== false
        if (enabled) {
          releaseDecision = decideRelease(req, parsedConfig)
          requestHeaders.set(
            parsedConfig.headers?.release || 'x-release-channel',
            releaseDecision.variant
          )
          requestHeaders.set(
            parsedConfig.headers?.releaseId || 'x-release-id',
            releaseDecision.releaseId
          )
        }
      } catch (error) {
        console.error('Failed to read Edge Config canary settings', error)
      }
    }
  }

  const shouldRewrite = !!parsedConfig?.rewritePrefix && releaseDecision?.variant === 'canary'

  let response: NextResponse
  if (shouldRewrite && parsedConfig?.rewritePrefix) {
    const rewriteUrl = req.nextUrl.clone()
    rewriteUrl.pathname = `${parsedConfig.rewritePrefix}${req.nextUrl.pathname}`
    response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Always include request id and security headers in response
  response.headers.set('x-request-id', reqId)
  for (const [k, v] of Object.entries(securityHeaders())) response.headers.set(k, v)

  if (releaseDecision) {
    response.headers.set(
      parsedConfig?.headers?.release || 'x-release-channel',
      releaseDecision.variant
    )
    response.headers.set(
      parsedConfig?.headers?.releaseId || 'x-release-id',
      releaseDecision.releaseId
    )

    if (releaseDecision.shouldSetIdentity) {
      response.cookies.set(releaseDecision.identityCookieName, releaseDecision.identity, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      })
    }

    response.cookies.set(releaseDecision.variantCookieName, releaseDecision.variantCookieValue, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
    })
  }

  if (isApi) {
    const cors = buildCorsHeaders(req)
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v)

    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers })
    }
  }

  return response
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next|static|favicon.ico|asset-manifest.json).*)'],
}
