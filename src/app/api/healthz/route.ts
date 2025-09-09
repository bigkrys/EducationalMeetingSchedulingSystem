import { NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { getRedisClient, initRedis } from '@/lib/api/cache'
import { testEmailConnection } from '@/lib/api/email'
import { env } from '@/lib/env'
import { ok, fail } from '@/lib/api/response'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function getHandler() {
  const started = Date.now()
  const checks: any = { app: { ok: true, time: new Date().toISOString() } }

  // DB check
  try {
    const t0 = Date.now()
    // cheap DB call
    await prisma.$queryRaw`SELECT 1`
    checks.db = { ok: true, latency_ms: Date.now() - t0 }
  } catch (e: any) {
    checks.db = { ok: false, error: String(e?.message || e) }
  }

  // Cache check (optional)
  try {
    if (env.REDIS_URL) {
      if (!getRedisClient()) {
        await initRedis()
      }
      const client = getRedisClient()
      if (client) {
        const t0 = Date.now()
        await client.ping()
        checks.cache = { ok: true, latency_ms: Date.now() - t0, type: 'redis' }
      } else {
        checks.cache = { ok: true, type: 'memory-only' }
      }
    } else {
      checks.cache = { ok: true, type: 'memory-only' }
    }
  } catch (e: any) {
    checks.cache = { ok: false, error: String(e?.message || e) }
  }

  // Email check (optional; off by default)
  try {
    const doCheck = (env.HEALTHZ_CHECK_EMAIL || 'false').toLowerCase() === 'true'
    if (doCheck) {
      const t0 = Date.now()
      const okConn = await Promise.race([
        testEmailConnection(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ])
      checks.email = { ok: okConn, latency_ms: Date.now() - t0 }
    }
  } catch (e: any) {
    checks.email = { ok: false, error: String(e?.message || e) }
  }

  const overallOk = Object.values(checks).every((s: any) => s?.ok !== false)
  if (!overallOk) {
    return fail('health check failed', 500, 'UNHEALTHY', { checks, total_ms: Date.now() - started })
  }
  return ok({ ...checks, total_ms: Date.now() - started })
}

export const GET = withSentryRoute(getHandler as any, 'api GET /api/healthz')
