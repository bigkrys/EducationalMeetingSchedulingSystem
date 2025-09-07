import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRateLimit, withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'

// 获取特定 teacherId+slot 的候补队列详情
async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId') || ''
    const slot = searchParams.get('slot') || ''
    const studentId = searchParams.get('studentId') || '' // 可选，仅用于计算 myPosition

    if (!teacherId || !slot) {
      return fail('teacherId and slot are required', 400, 'BAD_REQUEST')
    }

    const slotDate = new Date(slot)

    const items = await prisma.waitlist.findMany({
      where: { teacherId, slot: slotDate },
      include: { student: { select: { user: true, serviceLevel: true } } },
      orderBy: [{ createdAt: 'asc' }],
      take: 200,
    })

    const total = await prisma.waitlist.count({ where: { teacherId, slot: slotDate } })

    let myPosition: number | null = null
    if (studentId) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].studentId === studentId) {
          myPosition = i + 1
          break
        }
      }
      // 不在前200名时，可额外查询计数
      if (myPosition === null) {
        const me = await prisma.waitlist.findFirst({
          where: { teacherId, slot: slotDate, studentId },
        })
        if (me) {
          const ahead = await prisma.waitlist.count({
            where: {
              teacherId,
              slot: slotDate,
              createdAt: { lt: me.createdAt },
            },
          })
          myPosition = ahead + 1
        }
      }
    }

    // 计算展示字段：统一显示学生姓名与优先级（根据 serviceLevel 推断）
    const levelToPriority = (lvl?: string) =>
      lvl === 'premium' ? 200 : lvl === 'level1' ? 100 : lvl === 'level2' ? 50 : 0

    const waitlist = items.map((it: any) => ({
      id: it.id,
      teacherId: it.teacherId,
      slot: it.slot.toISOString(),
      priority: levelToPriority(it.student?.serviceLevel),
      createdAt: it.createdAt.toISOString(),
      studentId: it.studentId,
      studentName: it.student?.user?.name,
    }))

    return ok({ total, waitlist, myPosition })
  } catch (error) {
    logger.error('waitlist.slot.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch waitlist slot', 500, 'INTERNAL_ERROR')
  }
}

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 120 })(
  withRoles(['student', 'teacher', 'admin'])(getHandler as any)
)
