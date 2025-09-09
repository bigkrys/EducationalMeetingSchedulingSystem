import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { withRoles } from '@/lib/api/middleware'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    const today = new Date()
    const isFirstDayOfMonth = today.getDate() === 1

    if (!isFirstDayOfMonth && !force) {
      return fail(
        'Quota reset can only be triggered on the first day of month or with force=true',
        400,
        'BAD_REQUEST'
      )
    }

    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)

    const studentsToReset = await prisma.student.findMany({
      where: {
        lastQuotaReset: { lt: firstDay },
      },
      select: { id: true, monthlyMeetingsUsed: true, lastQuotaReset: true },
    })

    if (studentsToReset.length === 0) {
      return ok({ message: 'No students need quota reset', updated: 0 })
    }

    await prisma.$transaction(
      studentsToReset.map((student) =>
        prisma.student.update({
          where: { id: student.id },
          data: { monthlyMeetingsUsed: 0, lastQuotaReset: firstDay },
        })
      )
    )

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_QUOTA_RESET',
        details: JSON.stringify({
          resetDate: today.toISOString(),
          forced: force,
          studentsCount: studentsToReset.length,
        }),
      },
    })

    return ok({
      message: 'Monthly quota reset completed',
      updated: studentsToReset.length,
      forced: force,
      updatedIds: studentsToReset.map((s) => s.id),
    })
  } catch (error) {
    logger.error('admin.jobs.reset_quota.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to reset monthly quotas', 500, 'INTERNAL_ERROR')
  }
}

export const POST = withRoles(['admin', 'superadmin'])(
  withSentryRoute(handler as any, 'api POST /api/admin/tasks/reset-quota')
)
