import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { sendAppointmentExpiredNotification } from '@/lib/api/email'
import { deleteCachePattern } from '@/lib/api/cache'
import { withSentryRoute } from '@/lib/monitoring/sentry'
import { DEFAULT_EXPIRE_HOURS } from '@/constants'

async function handler(request: NextRequest) {
  try {
    // 计算过期阈值（与定时任务逻辑保持一致）
    let expireHours = DEFAULT_EXPIRE_HOURS
    const envVal = process.env.JOB_EXPIRE_HOURS
    if (envVal) {
      const parsed = parseInt(envVal, 10)
      if (!Number.isNaN(parsed) && parsed > 0) expireHours = parsed
    }

    try {
      const def = await prisma.servicePolicy.findUnique({ where: { level: 'default' } })
      if (def?.expireHours && def.expireHours > 0) {
        expireHours = def.expireHours
      } else {
        const all = await prisma.servicePolicy.findMany({ select: { expireHours: true } })
        if (all.length)
          expireHours = Math.min(...all.map((p) => p.expireHours || DEFAULT_EXPIRE_HOURS))
      }
    } catch (e) {
      console.warn('fallback to default expire hours', e)
    }

    const expireTime = new Date()
    expireTime.setHours(expireTime.getHours() - expireHours)

    const batchSize = 200
    let totalExpired = 0
    const expiredIds: string[] = []

    while (true) {
      const batch = await prisma.appointment.findMany({
        where: { status: 'pending', createdAt: { lt: expireTime } },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
        include: { student: { include: { user: true } }, teacher: { include: { user: true } } },
      })
      if (!batch.length) break

      const ids = batch.map((b) => b.id)
      await prisma.appointment.updateMany({
        where: { id: { in: ids } },
        data: { status: 'expired' },
      })
      totalExpired += batch.length
      expiredIds.push(...ids)

      // 通知与审计
      const concurrency = 10
      let index = 0
      const worker = async (): Promise<void> => {
        if (index >= batch.length) return
        const item = batch[index++]
        try {
          const subject = await prisma.subject.findUnique({ where: { id: item.subjectId } })
          if (subject) {
            await sendAppointmentExpiredNotification(
              item.student.user.email,
              item.teacher.user.email,
              {
                studentName: item.student.user.name,
                teacherName: item.teacher.user.name,
                subject: subject.name,
                scheduledTime: item.scheduledTime.toLocaleString('zh-CN', {
                  timeZone: (item as any)?.teacher?.timezone || 'UTC',
                }),
              }
            )
          }
          await prisma.auditLog.create({
            data: {
              action: 'ADMIN_APPOINTMENT_EXPIRED',
              targetId: item.id,
              details: JSON.stringify({
                appointmentId: item.id,
                studentId: item.studentId,
                studentName: item.student.user.name,
                teacherId: item.teacherId,
                teacherName: item.teacher.user.name,
                scheduledTime: item.scheduledTime.toISOString(),
                expiredAt: new Date().toISOString(),
                reason: `${expireHours} hours timeout without teacher approval`,
              }),
            },
          })
        } catch (err) {
          logger.error('admin.jobs.expire.process_failed', {
            ...getRequestMeta(request),
            error: String(err),
          })
        }
        return worker()
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, () => worker()))

      for (const item of batch) {
        const dateStr = item.scheduledTime.toISOString().split('T')[0]
        await deleteCachePattern(`slots:${item.teacherId}:${dateStr}`)
      }

      if (batch.length < batchSize) break
    }

    return ok({
      message: 'Pending appointments expired',
      updated: totalExpired,
      expireHours,
      expiredIds,
    })
  } catch (error) {
    logger.error('admin.jobs.expire.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to expire pending appointments', 500, 'INTERNAL_ERROR')
  }
}

export const POST = withRoles(['admin', 'superadmin'])(
  withSentryRoute(handler as any, 'api POST /api/admin/tasks/expire-pending')
)
