import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import {
  sendNewAppointmentRequestNotification,
  sendAppointmentApprovedNotification,
  sendAppointmentRequestSubmittedNotification,
} from '@/lib/api/email'
import { promoteForSlotTx } from '@/lib/waitlist/promotion'

// 提升候补队列中的学生
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck
    const body = rawBody ? JSON.parse(rawBody) : {}
    const { teacherId, slot, subject } = body

    if (!teacherId || !slot || !subject) {
      return fail(
        'teacherId, slot, and subject are required',
        400,
        E.WAITLIST_PROMOTE_MISSING_FIELDS
      )
    }

    const slotDate = new Date(slot)
    const dateStr = slotDate.toISOString().split('T')[0]

    // 并发安全晋升（内部处理创建或复用已取消的预约行）
    const result = await prisma.$transaction((tx) =>
      promoteForSlotTx(tx, teacherId, slotDate, subject)
    )

    if (result.promoted === 0) {
      return ok({ message: 'No students promoted', promoted: 0, code: E.WAITLIST_EMPTY })
    }

    // 发送通知（事务外）
    try {
      const appt = await prisma.appointment.findUnique({
        where: { id: (result as any).appointmentId },
        include: {
          student: { include: { user: true } },
          teacher: { include: { user: true } },
          subject: true,
        },
      })
      if (appt && appt.student?.user && appt.teacher?.user) {
        const scheduledLocal = slotDate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: (appt.teacher as any)?.timezone || 'UTC',
        })
        if ((result as any).status === 'pending') {
          const p1 = sendNewAppointmentRequestNotification(appt.teacher.user.email, {
            studentName: appt.student.user.name,
            subject: appt.subject.name,
            scheduledTime: scheduledLocal,
            durationMinutes: appt.durationMinutes,
            studentEmail: appt.student.user.email,
          })
          const p2 = sendAppointmentRequestSubmittedNotification(appt.student.user.email, {
            studentName: appt.student.user.name,
            teacherName: appt.teacher.user.name,
            subject: appt.subject.name,
            scheduledTime: scheduledLocal,
            durationMinutes: appt.durationMinutes,
          })
          if (process.env.SEND_EMAIL_SYNC === 'true') {
            await p1
            await p2
          } else {
            p1.catch((e) =>
              logger.error('waitlist.promote.email.request_failed', { error: String(e) })
            )
            p2.catch((e) =>
              logger.error('waitlist.promote.email.request_student_failed', { error: String(e) })
            )
          }
        } else {
          const fn = async () =>
            await sendAppointmentApprovedNotification(
              appt.student.user.email,
              appt.teacher.user.email,
              {
                studentName: appt.student.user.name,
                teacherName: appt.teacher.user.name,
                subject: appt.subject.name,
                scheduledTime: scheduledLocal,
                durationMinutes: appt.durationMinutes,
              }
            )
          if (process.env.SEND_EMAIL_SYNC === 'true') await fn()
          else
            fn().catch((e) =>
              logger.error('waitlist.promote.email.approved_failed', { error: String(e) })
            )
        }
      }
    } catch (e) {
      logger.error('waitlist.promote.email.exception', { error: String(e) })
    }

    return ok({
      message: 'Student promoted successfully',
      promoted: 1,
      appointment: { id: (result as any).appointmentId },
    })
  } catch (error) {
    logger.error('waitlist.promote.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to promote waitlist student', 500, E.INTERNAL_ERROR)
  }
}

// subjectId 查找已迁移到 promotion helper
