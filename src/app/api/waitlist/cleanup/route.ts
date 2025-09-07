import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'

async function postHandler(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { teacherId, slot } = body || {}

    if (!teacherId || !slot) {
      return fail('teacherId and slot are required', 400, 'BAD_REQUEST')
    }

    const user = (request as any).user
    // teacher只能清理自己的队列
    if (user?.role === 'teacher') {
      const meTeacher = await prisma.teacher.findUnique({ where: { userId: user.userId } })
      if (!meTeacher || meTeacher.id !== teacherId) {
        return fail('FORBIDDEN', 403, 'FORBIDDEN')
      }
    }

    const slotDate = new Date(slot)

    const { count } = await prisma.waitlist.deleteMany({ where: { teacherId, slot: slotDate } })

    // 审计日志
    try {
      await prisma.auditLog.create({
        data: {
          actorId: user?.userId,
          action: 'WAITLIST_CLEANED',
          targetId: teacherId,
          details: JSON.stringify({ teacherId, slot: slotDate.toISOString(), removed: count }),
        },
      })
    } catch (_) {}

    return ok({ message: 'Waitlist cleaned', removed: count })
  } catch (error) {
    logger.error('waitlist.cleanup.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to clean waitlist', 500, 'INTERNAL_ERROR')
  }
}

export const POST = withRoles(['teacher', 'admin'])(postHandler as any)
