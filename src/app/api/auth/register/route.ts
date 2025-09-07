import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { hashPassword } from '@/lib/api/auth.server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api/response'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute, span, metrics } from '@/lib/monitoring/sentry'

// 学生注册验证 schema
const studentRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.literal('student'),
  serviceLevel: z.enum(['level1', 'level2', 'premium']),
  subjectIds: z.array(z.string()).min(1), // 支持科目ID或名称
})

// 教师注册验证 schema
const teacherRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.literal('teacher'),
  subjectIds: z.array(z.string()).min(1), // 支持科目ID或名称
  maxDailyMeetings: z.number().int().min(1).max(12).default(6),
  bufferMinutes: z.number().int().min(5).max(60).default(15),
})

// 联合验证 schema - 只允许学生和教师注册
const registerSchema = z.union([studentRegisterSchema, teacherRegisterSchema])

// 禁止管理员注册
const adminRegisterSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    role: z.literal('admin'),
  })
  .refine(() => false, {
    message: '管理员账户不能通过注册创建',
  })

async function postHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // 检查邮箱是否已存在
    const existingUser = await span('db user.findUnique', () =>
      prisma.user.findUnique({ where: { email: validatedData.email } })
    )

    if (existingUser) {
      return fail('Email already registered', 409, 'EMAIL_EXISTS')
    }

    // 处理科目：支持科目名称和ID两种方式
    let subjectIds: string[] = []

    // 检查输入的是科目名称还是ID
    const isUUID = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

    if (validatedData.subjectIds.every((id) => isUUID(id))) {
      // 输入的是科目ID
      subjectIds = validatedData.subjectIds
    } else {
      // 输入的是科目名称，需要转换为ID
      const subjects = await span('db subject.findMany', () =>
        prisma.subject.findMany({ where: { name: { in: validatedData.subjectIds } } })
      )

      if (subjects.length !== validatedData.subjectIds.length) {
        const foundNames = subjects.map((s) => s.name)
        const missingNames = validatedData.subjectIds.filter((name) => !foundNames.includes(name))
        return fail(`Subjects not found: ${missingNames.join(', ')}`, 400, E.BAD_REQUEST)
      }

      subjectIds = subjects.map((s) => s.id)
    }

    // 验证科目ID是否存在且激活
    const subjects = await span('db subject.findMany', () =>
      prisma.subject.findMany({ where: { id: { in: subjectIds }, isActive: true } })
    )

    if (subjects.length !== subjectIds.length) {
      return fail('Some subjects are invalid or inactive', 400, E.BAD_REQUEST)
    }

    // 创建用户和对应的角色记录
    const passwordHash = await hashPassword(validatedData.password)

    if (validatedData.role === 'student') {
      const user = await span('db user.create(student)', () =>
        prisma.user.create({
          data: {
            email: validatedData.email,
            passwordHash,
            name: validatedData.name,
            role: 'student',
            status: 'active',
            student: {
              create: {
                serviceLevel: validatedData.serviceLevel,
                monthlyMeetingsUsed: 0,
                lastQuotaReset: new Date(),
              },
            },
          },
          include: {
            student: true,
          },
        })
      )

      // 创建学生-科目关联
      await span('db studentSubject.createMany', () =>
        prisma.studentSubject.createMany({
          data: subjectIds.map((subjectId) => ({
            studentId: user.student!.id,
            subjectId,
          })),
        })
      )

      try {
        metrics.increment('biz.auth.register.success', 1, { role: 'student' as any })
      } catch {}
      return ok({ userId: user.id, role: 'student' }, { status: 201 })
    } else if (validatedData.role === 'teacher') {
      const user = await span('db user.create(teacher)', () =>
        prisma.user.create({
          data: {
            email: validatedData.email,
            passwordHash,
            name: validatedData.name,
            role: 'teacher',
            status: 'active',
            teacher: {
              create: {
                maxDailyMeetings: validatedData.maxDailyMeetings,
                bufferMinutes: validatedData.bufferMinutes,
              },
            },
          },
          include: {
            teacher: true,
          },
        })
      )

      // 创建教师-科目关联
      await span('db teacherSubject.createMany', () =>
        prisma.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({
            teacherId: user.teacher!.id,
            subjectId,
          })),
        })
      )

      try {
        metrics.increment('biz.auth.register.success', 1, { role: 'teacher' as any })
      } catch {}
      return ok({ userId: user.id, role: 'teacher' }, { status: 201 })
    }

    return fail('Invalid role', 400, E.BAD_REQUEST)
  } catch (error) {
    if (error instanceof z.ZodError) {
      // 将 Zod 错误转换为更友好的中文错误信息
      const friendlyErrors = error.errors.map((err) => {
        const field = err.path[0]
        let message = err.message

        // 为常见字段提供中文错误信息
        if (field === 'password' && err.code === 'too_small') {
          message = '密码长度至少需要8个字符'
        } else if (field === 'email' && err.code === 'invalid_string') {
          message = '请输入有效的邮箱地址'
        } else if (field === 'name' && err.code === 'too_small') {
          message = '姓名不能为空'
        } else if (field === 'subjectIds' && err.code === 'too_small') {
          message = '请至少选择一个科目'
        }

        return {
          ...err,
          message,
        }
      })

      try {
        metrics.increment('biz.auth.register.error', 1, { reason: 'validation' as any })
      } catch {}
      return fail('输入数据验证失败', 400, E.BAD_REQUEST, friendlyErrors)
    }

    logger.error('auth.register.exception', { ...getRequestMeta(request), error: String(error) })

    // 处理 Prisma 错误
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any
      if (prismaError.code === 'P2002') {
        try {
          metrics.increment('biz.auth.register.error', 1, { reason: 'email_exists' as any })
        } catch {}
        return fail('该邮箱已被注册', 409, 'EMAIL_EXISTS')
      } else if (prismaError.code === 'P2003') {
        try {
          metrics.increment('biz.auth.register.error', 1, { reason: 'invalid_relation' as any })
        } catch {}
        return fail('关联数据无效，请检查科目选择', 400, E.BAD_REQUEST)
      }
    }

    // 处理其他类型的错误
    let errorMessage = '注册失败'
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    try {
      metrics.increment('biz.auth.register.error', 1, { reason: 'exception' as any })
    } catch {}
    return fail(errorMessage, 500, E.INTERNAL_ERROR)
  }
}

export const dynamic = 'force-dynamic'
export const POST = withSentryRoute(postHandler as any, 'api POST /api/auth/register')
