import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, withRoles, AuthenticatedRequest, withValidation } from '@/lib/api/middleware'
import { createTeacherSchema } from '@/lib/api/schemas'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

// 获取教师列表
async function getTeachersHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const subject = searchParams.get('subject')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    // 如果指定了科目，过滤教师
    if (subject) {
      where.teacherSubjects = {
        some: {
          subject: {
            name: {
              contains: subject,
            },
          },
        },
      }
    }

    // 暂时移除可用性过滤，返回所有教师
    // 后续可以根据需要添加更精确的过滤逻辑

    const teachers = await prisma.teacher.findMany({
      where,
      select: {
        id: true,
        maxDailyMeetings: true,
        bufferMinutes: true,
        user: {
          select: {
            name: true,
          },
        },
        teacherSubjects: {
          select: {
            subject: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: {
        user: {
          name: 'asc',
        },
      },
    })

    // 格式化返回数据
    const formattedTeachers = teachers.map((teacher: any) => ({
      id: teacher.id,
      name: teacher.user.name,
      subjects: teacher.teacherSubjects.map((ts: any) => ts.subject.name),
      maxDailyMeetings: teacher.maxDailyMeetings,
      bufferMinutes: teacher.bufferMinutes,
    }))

    return ok({ teachers: formattedTeachers, total: formattedTeachers.length, limit, offset })
  } catch (error) {
    logger.error('teachers.list.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch teachers', 500, E.INTERNAL_ERROR)
  }
}

// 创建教师（仅管理员）
async function createTeacherHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const user = request.user!

    // 检查权限
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return fail('Only admins can create teachers', 403, E.FORBIDDEN)
    }

    const body = await request.json()

    // 验证必需字段
    if (!body.userId || !body.subjects) {
      return fail('userId and subjects are required', 400, E.BAD_REQUEST)
    }

    // 检查用户是否存在且是教师角色
    const existingUser = await prisma.user.findUnique({
      where: { id: body.userId },
    })

    if (!existingUser) {
      return fail('User not found', 404, E.NOT_FOUND)
    }

    if (existingUser.role !== 'teacher') {
      return fail('User is not a teacher', 400, E.BAD_REQUEST)
    }

    // 检查是否已经是教师
    const existingTeacher = await prisma.teacher.findUnique({
      where: { userId: body.userId },
    })

    if (existingTeacher) {
      return fail('Teacher already exists for this user', 409, E.CONFLICT)
    }

    // 创建教师记录
    const teacher = await prisma.teacher.create({
      data: {
        userId: body.userId,
        maxDailyMeetings: body.maxDailyMeetings || 8,
        bufferMinutes: body.bufferMinutes || 15,
      },
    })

    // 创建教师-科目关联
    if (Array.isArray(body.subjects) && body.subjects.length > 0) {
      await prisma.teacherSubject.createMany({
        data: body.subjects.map((subjectId: string) => ({
          teacherId: teacher.id,
          subjectId,
        })),
      })
    }

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'create_teacher',
        targetId: teacher.id,
        details: JSON.stringify(body),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    })

    return ok({ teacher, message: 'Teacher created successfully' }, { status: 201 })
  } catch (error) {
    logger.error('teachers.create.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to create teacher', 500, E.INTERNAL_ERROR)
  }
}

// 导出处理函数
export const GET = withRoles(['student', 'teacher', 'admin'])(getTeachersHandler)
export const POST = withRoles(['admin', 'superadmin'])(
  withValidation(createTeacherSchema)(createTeacherHandler)
)
