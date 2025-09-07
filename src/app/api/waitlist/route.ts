import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, withRoles, withValidation } from '@/lib/api/middleware'
import { waitlistAddSchema, waitlistRemoveSchema } from '@/lib/api/schemas'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute, span, metrics } from '@/lib/monitoring/sentry'

// 获取候补队列
async function getWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')
    const teacherId = searchParams.get('teacherId')
    // 移除status过滤，因为Waitlist模型中没有status字段

    if (!studentId && !teacherId) {
      return fail('studentId or teacherId is required', 400, E.WAITLIST_MISSING_FIELDS)
    }

    const where: any = {}
    if (studentId) where.studentId = studentId
    if (teacherId) where.teacherId = teacherId

    const waitlistItems = await span('db waitlist.findMany', () =>
      prisma.waitlist.findMany({
        where,
        include: {
          student: { select: { user: true, serviceLevel: true } },
          teacher: { include: { user: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      })
    )

    return ok({
      items: waitlistItems.map((item: any) => ({
        id: item.id,
        teacherId: item.teacherId,
        teacherName: item.teacher.user.name,
        studentId: item.studentId,
        studentName: item.student.user.name,
        date: item.date,
        slot: item.slot.toISOString(),
        priority:
          item.student?.serviceLevel === 'premium'
            ? 200
            : item.student?.serviceLevel === 'level1'
              ? 100
              : item.student?.serviceLevel === 'level2'
                ? 50
                : 0,
        createdAt: item.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('waitlist.get.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch waitlist', 500, E.INTERNAL_ERROR)
  }
}

// 添加到候补队列
async function addToWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const body = (request as any).validatedBody ?? (await request.json().catch(() => ({})))
    const { teacherId, date, slot, studentId, subject } = body

    if (!teacherId || !date || !slot || !studentId || !subject) {
      return fail('Missing required fields', 400, E.WAITLIST_MISSING_FIELDS)
    }

    // 检查学生是否已经在候补队列中
    const existingEntry = await span('db waitlist.findFirst', () =>
      prisma.waitlist.findFirst({
        where: {
          teacherId,
          studentId,
          date,
          slot: new Date(slot),
        },
      })
    )

    if (existingEntry) {
      return fail('Student already in waitlist for this slot', 409, E.WAITLIST_DUPLICATE_ENTRY)
    }

    // 获取学生信息（服务级别、userId 等）
    const student = await span('db student.findUnique', () =>
      prisma.student.findUnique({
        where: { id: studentId },
        select: {
          serviceLevel: true,
          userId: true,
        },
      })
    )

    // 计算实际 date（UTC 基准）
    const slotDate = new Date(slot)
    const dateStr = slotDate.toISOString().slice(0, 10)

    // 创建候补队列条目
    const waitlistEntry = await span('db waitlist.create', () =>
      prisma.waitlist.create({
        data: {
          teacherId,
          studentId,
          date: dateStr,
          slot: slotDate,
        },
      })
    )

    // 记录审计日志
    if (student?.userId) {
      await span('db auditLog.create', () =>
        prisma.auditLog.create({
          data: {
            actorId: student.userId,
            action: 'WAITLIST_ADDED',
            targetId: waitlistEntry.id,
            details: JSON.stringify({
              teacherId,
              date,
              slot,
              subject,
              // priority字段已移除
              reason: 'Student added to waitlist for unavailable slot',
            }),
          },
        })
      )
    }

    // 计算 position（基于 createdAt asc）
    const position = await span('db waitlist.count', () =>
      prisma.waitlist.count({
        where: {
          teacherId,
          slot: slotDate,
          createdAt: { lte: waitlistEntry.createdAt },
        },
      })
    )

    return ok(
      { message: 'Added to waitlist successfully', id: waitlistEntry.id, position },
      { status: 201 }
    )
  } catch (error) {
    logger.error('waitlist.add.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to add to waitlist', 500, E.INTERNAL_ERROR)
  }
}

// 从候补队列移除
async function removeFromWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const body = (request as any).validatedBody ?? (await request.json().catch(() => ({})))
    const { id, studentId } = body

    if (!id || !studentId) {
      return fail('Missing required fields', 400, E.WAITLIST_MISSING_FIELDS)
    }

    // 验证权限（只能移除自己的条目）
    const waitlistEntry = await span('db waitlist.findUnique', () =>
      prisma.waitlist.findUnique({
        where: { id },
        include: { student: { include: { user: true } } },
      })
    )

    if (!waitlistEntry) {
      return fail('Waitlist entry not found', 404, E.WAITLIST_ENTRY_NOT_FOUND)
    }

    if (waitlistEntry.studentId !== studentId) {
      return fail("Cannot remove other student's waitlist entry", 403, E.WAITLIST_FORBIDDEN_REMOVE)
    }

    // 删除候补队列条目
    await span('db waitlist.delete', () =>
      prisma.waitlist.delete({
        where: { id },
      })
    )

    // 记录审计日志
    await span('db auditLog.create', () =>
      prisma.auditLog.create({
        data: {
          actorId: studentId,
          action: 'WAITLIST_REMOVED',
          targetId: id,
          details: JSON.stringify({
            reason: 'Student removed from waitlist',
          }),
        },
      })
    )

    return ok({ message: 'Removed from waitlist successfully' })
  } catch (error) {
    logger.error('waitlist.remove.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to remove from waitlist', 500, E.INTERNAL_ERROR)
  }
}

import { withRateLimit } from '@/lib/api/middleware'

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 120 })(
  withRoles(['student', 'teacher'])(withSentryRoute(getWaitlistHandler, 'api GET /api/waitlist'))
)
export const POST = withRateLimit({ windowMs: 60 * 1000, max: 30 })(
  withRole('student')(
    withValidation(waitlistAddSchema)(
      withSentryRoute(addToWaitlistHandler, 'api POST /api/waitlist')
    )
  )
)
export const DELETE = withRateLimit({ windowMs: 60 * 1000, max: 30 })(
  withRole('student')(
    withValidation(waitlistRemoveSchema)(
      withSentryRoute(removeFromWaitlistHandler, 'api DELETE /api/waitlist')
    )
  )
)
