import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { withRoles } from '@/lib/api/middleware'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute } from '@/lib/monitoring/sentry'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { addHours, subHours } from 'date-fns'

async function handler(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { offsetHours } = body as { offsetHours?: number }

    if (!offsetHours || ![1, 24].includes(offsetHours)) {
      return fail('offsetHours must be 1 or 24', 400, E.BAD_REQUEST)
    }

    const now = new Date()
    const reminderStart = addHours(now, offsetHours)
    const reminderEnd = addHours(now, offsetHours + 1)

    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledTime: { gte: reminderStart, lt: reminderEnd },
        status: 'approved',
        id: { notIn: await getAlreadyRemindedAppointments(offsetHours) },
      },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
        subject: true,
      },
    })

    if (!appointments.length) {
      return ok({ message: `No appointments need ${offsetHours}h reminder`, sent: 0 })
    }

    const results = await Promise.all(
      appointments.map(async (appointment: any) => {
        try {
          await sendReminder(appointment, offsetHours)
          await prisma.auditLog.create({
            data: {
              action: 'ADMIN_REMINDER_SENT',
              targetId: appointment.id,
              details: JSON.stringify({
                appointmentId: appointment.id,
                studentId: appointment.studentId,
                studentName: appointment.student.user.name,
                teacherId: appointment.teacherId,
                teacherName: appointment.teacher.user.name,
                scheduledTime: appointment.scheduledTime.toISOString(),
                subject: appointment.subject.name,
                offsetHours,
              }),
            },
          })
          return { success: true, appointmentId: appointment.id }
        } catch (err) {
          return { success: false, appointmentId: appointment.id, error: String(err) }
        }
      })
    )

    const successful = results.filter((r) => r.success).length
    const failed = results.length - successful

    return ok({
      message: 'Reminders sent',
      sent: successful,
      failed,
      total: results.length,
      offsetHours,
      results: {
        successfulIds: results.filter((r) => r.success).map((r) => r.appointmentId),
        failed: results
          .filter((r) => !r.success)
          .map((r) => ({ id: r.appointmentId, error: r.error })),
      },
    })
  } catch (error) {
    logger.error('admin.jobs.remind.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to send reminders', 500, E.INTERNAL_ERROR)
  }
}

async function getAlreadyRemindedAppointments(offsetHours: number): Promise<string[]> {
  const oneDayAgo = subHours(new Date(), 24)
  const logs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['REMINDER_SENT', 'ADMIN_REMINDER_SENT'] },
      createdAt: { gte: oneDayAgo },
      details: { contains: `"offsetHours":${offsetHours}` },
    },
    select: { targetId: true },
  })
  return logs.map((l) => l.targetId).filter((id): id is string => !!id)
}

async function sendReminder(appointment: any, offsetHours: number): Promise<void> {
  // 这里可以集成实际通知；当前为模拟
  await new Promise((resolve) => setTimeout(resolve, 50))
}

export const POST = withRoles(['admin', 'superadmin'])(
  withSentryRoute(handler as any, 'api POST /api/admin/tasks/remind')
)
