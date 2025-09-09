import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'

// 清理已被占用槽位（pending/approved）的候补记录
// 典型用法：定时触发，清除残留 waitlist
// body: { limit?: number } 每次处理的 teacherId+slot 组合上限（默认 500）
async function postHandler(request: NextRequest) {
  try {
    const rawBody = await request.text().catch(() => '')
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck

    const body = rawBody ? JSON.parse(rawBody) : {}
    const limit = Number.isFinite(body?.limit)
      ? Math.max(1, Math.min(2000, Number(body.limit)))
      : 500

    // 读取当前 waitlist 中的 (teacherId, slot) 组合
    const pairs = await prisma.waitlist.findMany({
      select: { teacherId: true, slot: true },
      take: limit,
    })

    if (pairs.length === 0) {
      return ok({ message: 'No waitlist entries to check', checked: 0, removed: 0 })
    }

    // 聚合去重
    const key = (p: { teacherId: string; slot: Date }) => `${p.teacherId}__${p.slot.toISOString()}`
    const uniq = new Map<string, { teacherId: string; slot: Date }>()
    for (const p of pairs) uniq.set(key(p), p)

    let removed = 0
    let checked = 0
    for (const p of uniq.values()) {
      checked += 1
      const occupied = await prisma.appointment.count({
        where: {
          teacherId: p.teacherId,
          scheduledTime: p.slot,
          status: { in: ['pending', 'approved'] },
        },
      })
      if (occupied > 0) {
        const del = await prisma.waitlist.deleteMany({
          where: { teacherId: p.teacherId, slot: p.slot },
        })
        removed += del.count
      }
    }

    return ok({ message: 'Cleanup completed', checked, removed })
  } catch (error) {
    logger.error('jobs.cleanup_waitlist.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to cleanup waitlist', 500, E.INTERNAL_ERROR)
  }
}

export const POST = withSentryRoute(postHandler as any, 'api POST /api/jobs/cleanup-waitlist')
