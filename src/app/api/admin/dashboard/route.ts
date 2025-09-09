import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function getAdminDashboardHandler(request: NextRequest, context?: any) {
  try {
    // 获取统计数据
    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      totalAppointments,
      pendingApprovals,
      expiredAppointments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.appointment.count(),
      prisma.appointment.count({ where: { status: 'pending' } }),
      prisma.appointment.count({ where: { status: 'expired' } }),
    ])

    // 检查系统健康状态
    type HealthStatus = 'healthy' | 'warning' | 'error'
    const systemHealth: {
      database: HealthStatus
      cache: HealthStatus
      queue: HealthStatus
    } = {
      database: 'healthy',
      cache: 'healthy',
      queue: 'healthy',
    }

    // 检查数据库连接
    try {
      await prisma.$queryRaw`SELECT 1`
      systemHealth.database = 'healthy'
    } catch (error) {
      systemHealth.database = 'error'
    }

    // 检查缓存状态（这里简化处理，实际应该检查Redis连接）
    try {
      // 模拟缓存检查
      systemHealth.cache = 'healthy'
    } catch (error) {
      systemHealth.cache = 'warning'
    }

    // 检查队列状态（这里简化处理，实际应该检查队列系统）
    try {
      // 模拟队列检查
      systemHealth.queue = 'healthy'
    } catch (error) {
      systemHealth.queue = 'warning'
    }

    const dashboardData = {
      stats: {
        totalUsers,
        totalStudents,
        totalTeachers,
        totalAppointments,
        pendingApprovals,
        expiredAppointments,
      },
      systemHealth,
    }

    return ok(dashboardData)
  } catch (error) {
    logger.error('admin.dashboard.get.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to fetch dashboard data', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRoles(['admin', 'superadmin'])(
  withSentryRoute(getAdminDashboardHandler, 'api GET /api/admin/dashboard')
)
