import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { sendNewAppointmentRequestNotification } from '@/lib/api/email'

// 重新提醒教师审批仍处于 pending 的预约
// 典型触发：创建后 24 小时仍未审批
// body: { afterHours?: number } 默认 24；最近 6 小时内已提醒过的将跳过
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text().catch(() => '')
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck

    const body = rawBody ? JSON.parse(rawBody) : {}
    const afterHours = Number.isFinite(body?.afterHours) ? Number(body.afterHours) : 24
    const cooldownHours = Number(process.env.APPROVAL_REMINDER_COOLDOWN_HOURS || '6')

    const now = new Date()
    const createdBefore = new Date(now.getTime() - afterHours * 3600 * 1000)
    const cooldownSince = new Date(now.getTime() - cooldownHours * 3600 * 1000)

    // 找到 pending 且满足创建时间阈值，且近期未发送过提醒的预约
    const candidates = await prisma.appointment.findMany({
      where: {
        status: 'pending',
        createdAt: { lte: createdBefore },
      },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
        subject: true,
      },
      take: 500,
    })

    if (candidates.length === 0) {
      return ok({ message: 'No pending appointments to remind', checked: 0, reminded: 0 })
    }

    // 读取近期已提醒记录，避免重复提醒
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        action: 'APPROVAL_REMINDER_SENT',
        createdAt: { gte: cooldownSince },
      },
      select: { targetId: true },
    })
    const recentlyReminded = new Set(recentLogs.map((l) => l.targetId).filter(Boolean) as string[])

    let reminded = 0
    for (const appt of candidates) {
      if (!appt.teacher?.user?.email || !appt.student?.user?.email) continue
      if (recentlyReminded.has(appt.id)) continue

      const when = appt.scheduledTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: (appt.teacher as any)?.timezone || 'UTC',
      })

      try {
        const sendFn = async () =>
          await sendNewAppointmentRequestNotification(appt.teacher.user.email, {
            studentName: appt.student.user.name,
            studentEmail: appt.student.user.email,
            subject: appt.subject.name,
            scheduledTime: when,
            durationMinutes: appt.durationMinutes,
          })

        if (process.env.SEND_EMAIL_SYNC === 'true') {
          await sendFn()
        } else {
          sendFn().catch((e) =>
            logger.error('jobs.remind_approval.email_failed', { error: String(e), id: appt.id })
          )
        }

        await prisma.auditLog.create({
          data: {
            action: 'APPROVAL_REMINDER_SENT',
            targetId: appt.id,
            details: JSON.stringify({
              appointmentId: appt.id,
              teacherId: appt.teacherId,
              studentId: appt.studentId,
              type: 'pending_approval',
              afterHours,
            }),
          },
        })
        reminded += 1
      } catch (e) {
        logger.error('jobs.remind_approval.exception_item', { id: appt.id, error: String(e) })
      }
    }

    return ok({
      message: 'Approval reminders processed',
      checked: candidates.length,
      reminded,
      afterHours,
    })
  } catch (error) {
    logger.error('jobs.remind_approval.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to send approval reminders', 500, E.INTERNAL_ERROR)
  }
}
