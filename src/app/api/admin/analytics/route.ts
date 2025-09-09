import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // 状态分布
    const statuses = [
      'pending',
      'approved',
      'rejected',
      'completed',
      'cancelled',
      'no_show',
      'expired',
    ] as const
    const statusCounts = Object.fromEntries(
      await Promise.all(
        statuses.map(async (s) => [
          s,
          await prisma.appointment.count({ where: { createdAt: { gte: since }, status: s } }),
        ])
      )
    ) as Record<(typeof statuses)[number], number>

    const total = await prisma.appointment.count({ where: { createdAt: { gte: since } } })

    const approved = statusCounts.approved || 0
    const rejected = statusCounts.rejected || 0
    const completed = statusCounts.completed || 0
    const noShow = statusCounts.no_show || 0

    const approvalBase = approved + rejected
    const approvalRate = approvalBase > 0 ? approved / approvalBase : 0
    const noShowBase = completed + noShow
    const noShowRate = noShowBase > 0 ? noShow / noShowBase : 0

    // 平均审批时长（分钟）
    const approvedApts = await prisma.appointment.findMany({
      where: { approvedAt: { not: null }, createdAt: { gte: since } },
      select: { createdAt: true, approvedAt: true },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    })
    const avgApprovalMinutes = approvedApts.length
      ? Math.round(
          approvedApts
            .map((a) => (((a.approvedAt as Date).getTime() - a.createdAt.getTime()) / 60000) | 0)
            .reduce((a, b) => a + b, 0) / approvedApts.length
        )
      : 0

    // 按教师聚合（最近周期）
    const perTeacher = await prisma.appointment.groupBy({
      by: ['teacherId', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    })
    // 拼接教师名称
    const teacherIds = Array.from(new Set(perTeacher.map((x) => x.teacherId)))
    const teachers = await prisma.teacher.findMany({
      where: { id: { in: teacherIds } },
      include: { user: { select: { name: true } } },
    })
    const teacherNameMap = Object.fromEntries(teachers.map((t) => [t.id, t.user.name])) as Record<
      string,
      string
    >
    const teacherAgg: Array<{
      teacherId: string
      teacherName: string
      total: number
      approved: number
      rejected: number
      completed: number
      no_show: number
    }> = []
    for (const tid of teacherIds) {
      const rows = perTeacher.filter((r) => r.teacherId === tid)
      const rowCount = (s: string) =>
        rows.filter((r) => r.status === s).reduce((sum, r) => sum + (r._count?._all || 0), 0)
      teacherAgg.push({
        teacherId: tid,
        teacherName: teacherNameMap[tid] || '未知教师',
        total: rows.reduce((sum, r) => sum + (r._count?._all || 0), 0),
        approved: rowCount('approved'),
        rejected: rowCount('rejected'),
        completed: rowCount('completed'),
        no_show: rowCount('no_show'),
      })
    }
    teacherAgg.sort((a, b) => b.total - a.total)

    return ok({
      rangeDays: days,
      totals: { total, ...statusCounts },
      approvalRate,
      noShowRate,
      avgApprovalMinutes,
      teacherAgg: teacherAgg.slice(0, 10),
    })
  } catch (error) {
    logger.error('admin.analytics.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch analytics', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRoles(['admin', 'superadmin'])(
  withSentryRoute(handler, 'api GET /api/admin/analytics')
)
