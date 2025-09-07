import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { memoryCache } from '@/lib/api/cache'
import { calculateAvailableSlots } from '@/lib/scheduling'
import { withRateLimit } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span, metrics } from '@/lib/monitoring/sentry'

const getHandler = async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId')
    const date = searchParams.get('date')
    const durationParam = searchParams.get('duration')
    const duration = parseInt(durationParam || '30')

    // 验证 duration 为正整数
    if (!Number.isFinite(duration) || duration <= 0) {
      return fail('duration must be a positive integer', 400, 'BAD_REQUEST')
    }

    if (!teacherId || !date) {
      return fail('teacherId and date are required', 400, 'BAD_REQUEST')
    }

    // 检查缓存
    const cacheKey = `slots:${teacherId}:${date}:${duration}`
    const cachedSlots = memoryCache.get(cacheKey)
    if (cachedSlots) {
      return ok(cachedSlots)
    }

    // 验证教师是否存在
    const teacher = await span('db teacher.findUnique', () =>
      prisma.teacher.findUnique({
        where: { id: teacherId },
        include: {
          availability: {
            where: { isActive: true },
          },
          blockedTimes: true,
        },
      })
    )

    if (!teacher) {
      return fail('Teacher not found', 404, 'TEACHER_NOT_FOUND')
    }

    // 计算可用槽位（逻辑已移动到 lib/scheduling）
    const slots = await span('logic calculateAvailableSlots', () =>
      calculateAvailableSlots(teacher, date, duration)
    )

    // 统计当日已预约槽位与候补数量
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd = new Date(`${date}T23:59:59.999Z`)
    const booked = await span('db appointment.findMany', () =>
      prisma.appointment.findMany({
        where: {
          teacherId,
          scheduledTime: { gte: dayStart, lte: dayEnd },
          status: { in: ['pending', 'approved'] },
        },
        select: { scheduledTime: true },
      })
    )

    const waitlistItems = await span('db waitlist.findMany', () =>
      prisma.waitlist.findMany({
        where: { teacherId, date },
        select: { slot: true },
      })
    )
    const waitlistCount = new Map<string, number>()
    for (const it of waitlistItems) {
      const k = it.slot.toISOString()
      waitlistCount.set(k, (waitlistCount.get(k) || 0) + 1)
    }

    // 缓存结果（5分钟）
    const result = {
      teacherId,
      date,
      duration,
      slots,
      bookedSlots: booked.map((b) => b.scheduledTime.toISOString()),
      waitlistCount: Array.from(waitlistCount.entries()).map(([slotIso, count]) => ({
        slot: slotIso,
        count,
      })),
    }
    memoryCache.set(cacheKey, result, 5 * 60 * 1000)

    try {
      metrics.increment('biz.slots.view', 1)
    } catch {}
    return ok(result, {
      headers: {
        // 允许浏览器短期缓存，边缘更长，并支持过期后再验证
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    logger.error('slots.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch slots', 500, 'INTERNAL_ERROR')
  }
}

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 120 })(
  withSentryRoute(getHandler, 'api GET /api/slots')
)
