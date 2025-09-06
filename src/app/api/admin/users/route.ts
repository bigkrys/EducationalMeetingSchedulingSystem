import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, withValidation } from '@/lib/api/middleware'
import { createUserSchema, updateUserSchema } from '@/lib/api/schemas'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

async function getUsersHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // 构建查询条件
    const where: any = {}

    if (role) {
      where.role = role
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
    const body = await request.json()
    const { email, name, role, password } = body

    if (!email || !name || !role || !password) {
      return fail('Missing required fields', 400, E.BAD_REQUEST)
    }

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return fail('Email already registered', 409, 'EMAIL_EXISTS')
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        passwordHash: password, // 注意：实际应该哈希密码
        status: 'active',
      },
    })

    // 根据角色创建相应的记录
    if (role === 'student') {
      await prisma.student.create({
        data: {
          userId: user.id,
          serviceLevel: 'level1',
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date(),
        },
      })
    } else if (role === 'teacher') {
      await prisma.teacher.create({
        data: {
          userId: user.id,
          maxDailyMeetings: 6,
          bufferMinutes: 15,
        },
      })
    }

    return ok(
      {
        message: 'User created successfully',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('admin.users.create.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to create user', 500, E.INTERNAL_ERROR)
  }
}

async function updateUserHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { userId, updates } = body

    if (!userId || !updates) {
      return fail('Missing userId or updates', 400, E.BAD_REQUEST)
    }

    // 更新用户基本信息
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

export const GET = withRole('admin')(getUsersHandler)
export const POST = withRole('admin')(withValidation(createUserSchema)(createUserHandler))
export const PUT = withRole('admin')(withValidation(updateUserSchema)(updateUserHandler))
