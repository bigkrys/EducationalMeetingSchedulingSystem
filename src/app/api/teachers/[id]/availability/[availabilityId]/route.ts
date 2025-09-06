import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, AuthenticatedRequest } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

// 删除教师可用性
async function deleteAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    // 从 URL 中提取 teacherId 和 availabilityId
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 3] // /api/teachers/[id]/availability/[availabilityId]
    const availabilityId = pathParts[pathParts.length - 1]

    const user = request.user!

    // 检查权限 - 教师只能操作自己的资源
    if (user.role === 'teacher') {
      // 查找当前用户对应的教师记录
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId },
      })

      if (!currentTeacher) {
        return fail('Teacher record not found', 403, E.FORBIDDEN)
      }

      // 确保教师只能操作自己的资源
      if (currentTeacher.id !== teacherId) {
        return fail('Teachers can only delete their own availability', 403, E.FORBIDDEN)
      }

      // 验证可用性记录确实属于该教师
      const availability = await prisma.teacherAvailability.findFirst({
        where: {
          id: availabilityId,
          teacherId: teacherId,
        },
      })

      if (!availability) {
        return fail('Availability record not found', 404, E.NOT_FOUND)
      }
    }

    // 删除可用性记录
    await prisma.teacherAvailability.delete({
      where: { id: availabilityId },
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'delete_availability',
        targetId: availabilityId,
        details: JSON.stringify({ teacherId, availabilityId }),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    })

    return ok()
  } catch (error) {
    logger.error('availability.delete.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to delete availability', 500, E.INTERNAL_ERROR)
  }
}

// 导出处理函数
export const DELETE = withRole('teacher')(deleteAvailabilityHandler)
