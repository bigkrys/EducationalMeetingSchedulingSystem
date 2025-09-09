import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api/auth.server'
import { loginSchema } from '@/lib/api/validation'
import { z } from 'zod'
import { withRateLimit } from '@/lib/api/middleware'
import { prisma } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span, metricsIncrement } from '@/lib/monitoring/sentry'

const postHandler = async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = loginSchema.parse(body)

    const result = await span('auth.authenticateUser', () =>
      authenticateUser(validatedData.email, validatedData.password)
    )

    if (!result) {
      try {
        metricsIncrement('biz.auth.login.fail', 1, { reason: 'invalid_credentials' })
      } catch {}
      return fail('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS')
    }

    // 设置信息 HttpOnly cookie
    const response = ok({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      role: result.user.role,
    })

    // 设置 refresh token 为 HttpOnly cookie
    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // 记录审计日志（login 成功），后台写入，不阻塞响应
    ;(async () => {
      try {
        await prisma.auditLog.create({
          data: {
            actorId: result.user.id,
            action: 'login',
            details: JSON.stringify({
              ip: request.headers.get('x-forwarded-for') || 'unknown',
              userAgent: request.headers.get('user-agent') || 'unknown',
            }),
          },
        })
      } catch (e) {
        logger.warn('audit.login.write_failed', { ...getRequestMeta(request), error: String(e) })
      }
    })()

    try {
      metricsIncrement('biz.auth.login.success', 1, { role: (result.user as any).role })
    } catch {}

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid input data', 400, 'BAD_REQUEST')
    }
    // Prisma DB connectivity errors should return 503 so callers can retry
    try {
      const errAny = error as any
      if (
        errAny &&
        (errAny.code === 'P1001' ||
          (errAny.message &&
            typeof errAny.message === 'string' &&
            errAny.message.includes("Can't reach database server")))
      ) {
        logger.error('login.db_unreachable', { ...getRequestMeta(request), error: String(errAny) })
        try {
          metricsIncrement('biz.auth.login.fail', 1, { reason: 'db_unreachable' })
        } catch {}
        return fail('Database is unreachable. Please try again later.', 503, 'DB_UNAVAILABLE')
      }
    } catch (_) {}

    logger.error('login.exception', { ...getRequestMeta(request), error: String(error) })
    try {
      metricsIncrement('biz.auth.login.fail', 1, { reason: 'exception' })
    } catch {}
    return fail('Login failed', 500, 'INVALID')
  }
}

export const POST = withRateLimit({ windowMs: 60 * 1000, max: 10 })(
  withSentryRoute(postHandler, 'api POST /api/auth/login')
)
