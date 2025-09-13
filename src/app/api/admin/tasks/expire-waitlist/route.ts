import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span } from '@/lib/monitoring/sentry'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { sendEmail } from '@/lib/api/email'

async function handler(request: NextRequest) {
  try {
    const now = new Date()
    const expired = await span('db waitlist.findMany.expired.admin', () =>
      prisma.waitlist.findMany({
        where: { status: 'active', slot: { lt: now } },
        include: { student: { include: { user: true } }, teacher: { include: { user: true } } },
        take: 2000,
      })
    )

    if (!expired || expired.length === 0) {
      return ok({ message: 'No expired waitlist items', updated: 0 })
    }

    let updated = 0
    const results: any[] = []
    for (const item of expired) {
      try {
        await span('db waitlist.update.expire.admin', () =>
          prisma.waitlist.update({
            where: { id: item.id },
            data: { status: 'expired', expiresAt: now },
          })
        )
        try {
          await span('db auditLog.create.waitlist.expired.admin', () =>
            prisma.auditLog.create({
              data: {
                actorId: null,
                action: 'WAITLIST_EXPIRED',
                targetId: item.id,
                details: JSON.stringify({
                  teacherId: item.teacherId,
                  slot: item.slot?.toISOString(),
                }),
              },
            })
          )
        } catch (_) {}

        const studentEmail = item.student?.user?.email
        const teacherName = item.teacher?.user?.name || '教师'
        const studentName = item.student?.user?.name || ''
        const slotIso = item.slot ? item.slot.toISOString() : ''
        if (studentEmail) {
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #ff9800;">候补过期通知</h2>
              <p>亲爱的 ${studentName || '同学'}，</p>
              <p>您在教师 <strong>${teacherName}</strong> 的候补申请（时间：${slotIso}）已过期，系统已自动将其移除（状态：expired）。</p>
              <p>您可以重新提交预约或选择其他时间/教师。</p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
              <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
            </div>
          `
          try {
            await sendEmail(studentEmail, '候补已过期通知', html)
          } catch (e) {
            logger.error('admin.tasks.waitlist_expire.email_failed', {
              ...getRequestMeta(request),
              id: item.id,
              error: String(e),
            })
          }
        }

        updated += 1
        results.push({ id: item.id, status: 'expired', studentEmail })
      } catch (e) {
        logger.error('admin.tasks.waitlist_expire.item_failed', {
          ...getRequestMeta(request),
          id: item.id,
          error: String(e),
        })
        results.push({ id: item.id, error: String(e) })
      }
    }

    return ok({ message: 'Expired waitlist processed', updated, results })
  } catch (error) {
    logger.error('admin.tasks.waitlist_expire.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to process expired waitlist', 500, E.INTERNAL_ERROR)
  }
}

export const POST = withRoles(['admin', 'superadmin'])(
  withSentryRoute(handler as any, 'api POST /api/admin/tasks/expire-waitlist')
)
