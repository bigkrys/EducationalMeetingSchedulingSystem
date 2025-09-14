import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span } from '@/lib/monitoring/sentry'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { sendEmail } from '@/lib/api/email'

// 定时任务：将已过期（slot < now）的候补记录标记为 expired，并通知学生
// Auth：使用 JOB_TRIGGER_SECRET（以及可选的 HMAC/IP 白名单）
// Body: { limit?: number } — 每次处理的最大条目数（默认 1000）
async function postHandler(request: NextRequest) {
  try {
    const rawBody = await request.text().catch(() => '')
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck

    const body = rawBody ? JSON.parse(rawBody) : {}
    const limit = Number.isFinite(body?.limit)
      ? Math.max(1, Math.min(5000, Number(body.limit)))
      : 1000

    const now = new Date()

    const expired = await span('db waitlist.findMany.expired', () =>
      prisma.waitlist.findMany({
        where: { status: 'active', slot: { lt: now } },
        include: { student: { include: { user: true } }, teacher: { include: { user: true } } },
        take: limit,
      })
    )

    if (!expired || expired.length === 0) {
      return ok({ message: 'No expired waitlist items', updated: 0 })
    }

    let updated = 0
    const results: any[] = []

    for (const item of expired) {
      try {
        await span('db waitlist.update.expire', () =>
          prisma.waitlist.update({
            where: { id: item.id },
            data: { status: 'expired', expiresAt: now },
          })
        )

        // 写审计日志（不阻塞）
        try {
          await span('db auditLog.create.waitlist.expired', () =>
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

        // 邮件通知学生（若有邮箱）
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
            logger.error('jobs.waitlist_expire.email_failed', {
              ...getRequestMeta(request),
              id: item.id,
              error: String(e),
            })
          }
        }

        updated += 1
        results.push({ id: item.id, status: 'expired', studentEmail })
      } catch (e) {
        logger.error('jobs.waitlist_expire.item_failed', {
          ...getRequestMeta(request),
          id: item.id,
          error: String(e),
        })
        results.push({ id: item.id, error: String(e) })
      }
    }

    return ok({ message: 'Expired waitlist processed', updated, results })
  } catch (error) {
    logger.error('jobs.waitlist_expire.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to process expired waitlist', 500, E.INTERNAL_ERROR)
  }
}

export const POST = withSentryRoute(postHandler as any, 'api POST /api/jobs/expire-waitlist')
