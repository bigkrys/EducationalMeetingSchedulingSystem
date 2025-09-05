import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { memoryCache } from '@/lib/api/cache'
import { calculateAvailableSlots } from '@/lib/scheduling'
import { withRateLimit } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'

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
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: {
        availability: {
          where: { isActive: true }
        },
        blockedTimes: true
      }
    })

    if (!teacher) {
      return fail('Teacher not found', 404, 'TEACHER_NOT_FOUND')
    }

  // 计算可用槽位（逻辑已移动到 lib/scheduling）
  const slots = await calculateAvailableSlots(teacher, date, duration)

    // 缓存结果（5分钟）
    const result = {
      teacherId,
      date,
      duration,
      slots
    }
    memoryCache.set(cacheKey, result, 5 * 60 * 1000)

    return ok(result)

  } catch (error) {
    logger.error('slots.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch slots', 500, 'INTERNAL_ERROR')
  }
}

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 120 })(getHandler)

