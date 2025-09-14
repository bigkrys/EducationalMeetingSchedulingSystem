import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles, withValidation } from '@/lib/api/middleware'
import { createUserSchema, updateUserSchema } from '@/lib/api/schemas'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'
import { hashPassword } from '@/lib/api/auth.server'

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 500): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastErr = e
      // Prisma P1001: Can't reach database server — transient, retry
      if (e?.code === 'P1001' || /Can't reach database server/i.test(String(e))) {
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      break
    }
  }
  throw lastErr
}

async function getUsersHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit
    const reqUser = (request as any).user as { role?: string } | undefined

    // 构建查询条件
    const where: any = {}

    if (role) {
      // 普通管理员不可请求查看管理员/超级管理员
      if (reqUser?.role === 'admin' && (role === 'admin' || role === 'superadmin')) {
        return fail('Only superadmin can view admin users', 403, E.FORBIDDEN)
      }
      where.role = role
    }

    // 未指定role时，普通管理员自动排除管理员/超级管理员
    if (reqUser?.role === 'admin' && !role) {
      where.role = { notIn: ['admin', 'superadmin'] }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // 获取用户总数
    const total = await prisma.user.count({ where })

    // 获取用户列表
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    })

    return ok({ users, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('admin.users.get.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch users', 500, E.INTERNAL_ERROR)
  }
}

async function createUserHandler(request: NextRequest, context?: any) {
  try {
    const body = (request as any).validatedBody ?? (await request.json().catch(() => ({})))
    const { email, name, role, password } = body
    const reqUser = (request as any).user as { role?: string } | undefined

    if (!email || !name || !role || !password) {
      return fail('Missing required fields', 400, E.BAD_REQUEST)
    }

    // 只有超级管理员可以创建管理员；禁止创建超级管理员
    if (role === 'admin' && reqUser?.role !== 'superadmin') {
      return fail('Only superadmin can create admin users', 403, E.FORBIDDEN)
    }
    if (role === 'superadmin') {
      return fail('Cannot create superadmin via API', 403, E.FORBIDDEN)
    }

    // 检查邮箱是否已存在
    const existingUser = await withRetry(() => prisma.user.findUnique({ where: { email } }))

    if (existingUser) {
      return fail('Email already registered', 409, 'EMAIL_EXISTS')
    }

    const user = await withRetry(async () =>
      prisma.$transaction(async (tx) => {
        const pwdHash = await hashPassword(password)
        const created = await tx.user.create({
          data: {
            email,
            name,
            role,
            passwordHash: pwdHash,
            status: 'active',
          },
        })
        if (role === 'student') {
          await tx.student.create({
            data: {
              userId: created.id,
              serviceLevel: 'level1',
              monthlyMeetingsUsed: 0,
              lastQuotaReset: new Date(),
            },
          })
        } else if (role === 'teacher') {
          await tx.teacher.create({
            data: {
              userId: created.id,
              maxDailyMeetings: 6,
              bufferMinutes: 15,
            },
          })
        }
        return created
      })
    )

    return ok(
      {
        message: 'User created successfully',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201 }
    )
  } catch (error: any) {
    logger.error('admin.users.create.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    // 常见冲突/数据库不可达分情况返回
    if (error?.code === 'P2002') {
      return fail('Email already registered', 409, 'EMAIL_EXISTS')
    }
    if (error?.code === 'P1001' || /Can't reach database server/i.test(String(error))) {
      return fail('Database is unreachable. Please try again later.', 503, 'DB_UNAVAILABLE')
    }
    return fail('Failed to create user', 500, E.INTERNAL_ERROR)
  }
}

async function updateUserHandler(request: NextRequest, context?: any) {
  try {
    const body = (request as any).validatedBody ?? (await request.json().catch(() => ({})))
    const { userId, updates } = body
    const reqUser = (request as any).user as { role?: string } | undefined

    if (!userId || !updates) {
      return fail('Missing userId or updates', 400, E.BAD_REQUEST)
    }

    // 更新用户基本信息
    // 先查出被更新用户，进行权限判定
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    if (!current) {
      return fail('User not found', 404, E.NOT_FOUND)
    }

    if (
      (current.role === 'admin' || current.role === 'superadmin') &&
      reqUser?.role !== 'superadmin'
    ) {
      return fail('Only superadmin can modify admin/superadmin users', 403, E.FORBIDDEN)
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.email && { email: updates.email }),
        ...(updates.status && { status: updates.status }),
      },
    })

    // 如果是学生，更新学生特定信息
    if (user.role === 'student' && updates.student) {
      await prisma.student.update({
        where: { userId: userId },
        data: {
          ...(updates.student.serviceLevel && { serviceLevel: updates.student.serviceLevel }),
          ...(updates.student.monthlyMeetingsUsed !== undefined && {
            monthlyMeetingsUsed: updates.student.monthlyMeetingsUsed,
          }),
        },
      })
    }

    // 如果是教师，更新教师特定信息
    if (user.role === 'teacher' && updates.teacher) {
      await prisma.teacher.update({
        where: { userId: userId },
        data: {
          ...(updates.teacher.maxDailyMeetings && {
            maxDailyMeetings: updates.teacher.maxDailyMeetings,
          }),
          ...(updates.teacher.bufferMinutes && { bufferMinutes: updates.teacher.bufferMinutes }),
        },
      })
    }

    return ok({ message: 'User updated successfully', userId: user.id })
  } catch (error) {
    logger.error('admin.users.update.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to update user', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRoles(['admin', 'superadmin'])(
  withSentryRoute(getUsersHandler, 'api GET /api/admin/users')
)
export const POST = withRoles(['admin', 'superadmin'])(
  withValidation(createUserSchema)(withSentryRoute(createUserHandler, 'api POST /api/admin/users'))
)
export const PUT = withRoles(['admin', 'superadmin'])(
  withValidation(updateUserSchema)(withSentryRoute(updateUserHandler, 'api PUT /api/admin/users'))
)
