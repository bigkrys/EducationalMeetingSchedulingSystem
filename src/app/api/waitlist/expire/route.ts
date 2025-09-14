import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span } from '@/lib/monitoring/sentry'
import { sendEmail } from '@/lib/api/email'

async function postHandler(request: NextRequest) {
  try {
    const now = new Date()

    // 查找所有已过期（slot < now）且仍为 active 的候补条目
    const expiredItems = await span('db waitlist.findMany.expire', () =>
      prisma.waitlist.findMany({
        where: { status: 'active', slot: { lt: now } },
        include: { student: { include: { user: true } }, teacher: { include: { user: true } } },
      })
    )

    if (!expiredItems || expiredItems.length === 0) {
      return ok({ message: 'No expired waitlist items', removed: 0 })
    }

    const results = [] as any[]

    for (const item of expiredItems) {
      try {
        // 标记为 expired，记录 expiresAt
        await span('db waitlist.update.expire', () =>
          prisma.waitlist.update({
            where: { id: item.id },
            data: { status: 'expired', expiresAt: now },
          })
        )

        // 写审计日志
        try {
          await span('db auditLog.create.waitlist.expire', () =>
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

        // 给学生发送通知邮件（若存在邮箱）
        const studentEmail = item.student?.user?.email
        const teacherName = item.teacher?.user?.name || '教师'
        const studentName = item.student?.user?.name || ''
        const slotIso = item.slot ? item.slot.toISOString() : ''

        if (studentEmail) {
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #ff9800;">候补过期通知</h2>
              <p>亲爱的 ${studentName || '同学'}，</p>
              <p>您在教师 <strong>${teacherName}</strong> 的候补申请（时间：${slotIso}）已过期，系统已自动将其移除。</p>
              <p>您可以重新提交预约或选择其他时间/教师。</p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
              <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
            </div>
          `

          try {
            await sendEmail(studentEmail, '候补已过期通知', html)
          } catch (e) {
            logger.error('waitlist.expire.email_failed', {
              ...getRequestMeta(request),
              id: item.id,
              error: String(e),
            })
          }
        }

        results.push({ id: item.id, studentEmail, status: 'expired' })
      } catch (e) {
        logger.error('waitlist.expire.item_failed', {
          ...getRequestMeta(request),
          id: item.id,
          error: String(e),
        })
        results.push({ id: item.id, error: String(e) })
      }
    }

    return ok({ message: 'Expired processing complete', removed: results.length, results })
  } catch (error) {
    logger.error('waitlist.expire.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to expire waitlist items', 500, 'INTERNAL_ERROR')
  }
}

export const POST = withRoles(['admin'])(
  withSentryRoute(postHandler as any, 'api POST /api/waitlist/expire')
)
