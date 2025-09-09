import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles, AuthenticatedRequest } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function handler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const teacher = await prisma.teacher.findUnique({ where: { userId: request.user!.userId } })
    if (!teacher) return fail('Teacher not found', 404, E.TEACHER_NOT_FOUND)

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
          await prisma.appointment.count({
            where: { createdAt: { gte: since }, status: s, teacherId: teacher.id },
          }),
        ])
      )
    ) as Record<(typeof statuses)[number], number>

    const total = await prisma.appointment.count({
      where: { createdAt: { gte: since }, teacherId: teacher.id },
    })
    const approved = statusCounts.approved || 0
    const rejected = statusCounts.rejected || 0
    const completed = statusCounts.completed || 0
    const noShow = statusCounts.no_show || 0
    const approvalRate = approved + rejected > 0 ? approved / (approved + rejected) : 0
    const noShowRate = completed + noShow > 0 ? noShow / (completed + noShow) : 0

    const approvedApts = await prisma.appointment.findMany({
      where: { approvedAt: { not: null }, teacherId: teacher.id, createdAt: { gte: since } },
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

    // 按学生聚合（该教师）
    const perStudent = await prisma.appointment.groupBy({
      by: ['studentId', 'status'],
      where: { createdAt: { gte: since }, teacherId: teacher.id },
      _count: { _all: true },
    })
    const studentIds = Array.from(new Set(perStudent.map((x) => x.studentId)))
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { user: { select: { name: true } } },
    })
    const nameMap = Object.fromEntries(students.map((s) => [s.id, s.user.name])) as Record<
      string,
      string
    >
    const studentAgg: Array<{
      studentId: string
      studentName: string
      total: number
      approved: number
      completed: number
      no_show: number
    }> = []
    for (const sid of studentIds) {
      const rows = perStudent.filter((r) => r.studentId === sid)
      const rowCount = (s: string) =>
        rows.filter((r) => r.status === s).reduce((sum, r) => sum + (r._count?._all || 0), 0)
      studentAgg.push({
        studentId: sid,
        studentName: nameMap[sid] || '未知学生',
        total: rows.reduce((sum, r) => sum + (r._count?._all || 0), 0),
        approved: rowCount('approved'),
        completed: rowCount('completed'),
        no_show: rowCount('no_show'),
      })
    }
    studentAgg.sort((a, b) => b.total - a.total)

    return ok({
      rangeDays: days,
      totals: { total, ...statusCounts },
      approvalRate,
      noShowRate,
      avgApprovalMinutes,
      studentAgg: studentAgg.slice(0, 10),
    })
  } catch (error) {
    logger.error('teacher.analytics.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to fetch analytics', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRoles(['teacher', 'admin', 'superadmin'])(
  withSentryRoute(handler, 'api GET /api/teacher/analytics')
)
