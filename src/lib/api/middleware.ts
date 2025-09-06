import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, JWTPayload } from './jwt'
import { ZodSchema } from 'zod'

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload
}

export function withAuth(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>,
  requiredRoles?: string[]
) {
  return async (req: NextRequest, context?: any) => {
    try {
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'INVALID', message: 'Missing or invalid authorization header' },
          { status: 401 }
        )
      }

      const token = authHeader.substring(7)
      const payload = verifyAccessToken(token)

      if (!payload) {
        return NextResponse.json(
          { error: 'INVALID', message: 'Invalid or expired token' },
          { status: 401 }
        )
      }

      // 检查角色权限
      if (requiredRoles && !requiredRoles.includes(payload.role)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Insufficient permissions' },
          { status: 403 }
        )
      }

      // 将用户信息添加到请求对象
      const authenticatedReq = req as AuthenticatedRequest
      authenticatedReq.user = payload

      return handler(authenticatedReq, context)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json(
        { error: 'INVALID', message: 'Authentication failed' },
        { status: 401 }
      )
    }
  }
}

export function withRole(role: string) {
  return (handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
    return withAuth(handler, [role])
  }
}

export function withRoles(roles: string[]) {
  return (handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
    return withAuth(handler, roles)
  }
}

// 轻量速率限制中间件（进程内实现，仅用于防止明显滥用；生产可替换为 Redis 或外部限流）
export function withRateLimit(opts?: { windowMs?: number; max?: number; keyPrefix?: string }) {
  const windowMs = opts?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) // 1 minute
  const max = opts?.max ?? parseInt(process.env.RATE_LIMIT_MAX || '60', 10) // 60 requests per window
  const prefix = opts?.keyPrefix || 'rl'

  // 简单内存存储
  const store = new Map<string, { count: number; resetAt: number }>()

  return (handler: (req: NextRequest, context?: any) => Promise<NextResponse>) => {
    return async (req: NextRequest, context?: any) => {
      try {
        if (process.env.NODE_ENV !== 'production') {
          return handler(req, context)
        }

        const ip =
          (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
          req.headers.get('x-real-ip') ||
          'unknown'
        const key = `${prefix}:${ip}`
        const now = Date.now()
        const entry = store.get(key)
        if (!entry || entry.resetAt <= now) {
          store.set(key, { count: 1, resetAt: now + windowMs })
        } else {
          entry.count += 1
          store.set(key, entry)
          if (entry.count > max) {
            return NextResponse.json(
              { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' },
              { status: 429 }
            )
          }
        }

        return handler(req, context)
      } catch (error) {
        console.error('Rate limit middleware error:', error)
        return NextResponse.json(
          { error: 'INTERNAL_ERROR', message: 'Rate limiter failed' },
          { status: 500 }
        )
      }
    }
  }
}

// Zod validation middleware: validates request body (JSON) against provided schema
export function withValidation<T extends ZodSchema>(schema: T) {
  return (handler: (req: NextRequest, context?: any) => Promise<NextResponse>) => {
    return async (req: NextRequest, context?: any) => {
      try {
        // parse JSON body safely
        const raw = await req.text().catch(() => '')
        const parsed = raw ? JSON.parse(raw) : {}
        schema.parse(parsed)
        // attach validated body to request for handlers that expect it
        ;(req as any).validatedBody = parsed
        return handler(req, context)
      } catch (error: any) {
        // Zod error -> 400
        if (error && error.name === 'ZodError') {
          return NextResponse.json(
            { error: 'BAD_REQUEST', message: 'Invalid input data', details: error.errors },
            { status: 400 }
          )
        }
        console.error('Validation middleware error:', error)
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'Invalid input data' },
          { status: 400 }
        )
      }
    }
  }
}
