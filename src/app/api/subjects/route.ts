import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, withRateLimit } from '@/lib/api/middleware'
import { z } from 'zod'
import { ok, fail } from '@/lib/api/response'
import { logger } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

// 科目验证 schema
const subjectSchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .regex(/^[A-Z_]+$/, 'Code must be uppercase letters and underscores only'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
})

// 获取所有科目
const getHandler = async function GET() {
  try {
    const subjects = await prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })

    return ok({ subjects })
  } catch (error) {
    logger.error('subjects.get.exception', { error: String(error) })
    return fail('Failed to fetch subjects', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 120 })(getHandler)

// 创建新科目
async function createSubjectHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const validatedData = subjectSchema.parse(body)

    // 检查科目名称和代码是否已存在
    const existingSubject = await prisma.subject.findFirst({
      where: {
        OR: [{ name: validatedData.name }, { code: validatedData.code }],
      },
    })

    if (existingSubject) {
      return fail('Subject name or code already exists', 409, E.SUBJECT_CONFLICT)
    }

    const subject = await prisma.subject.create({
      data: validatedData,
    })

    // 记录审计日志
    const user = (request as any).user
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'create_subject',
        targetId: subject.id,
        details: JSON.stringify(validatedData),
      },
    })

    return ok({ subject }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid input data', 400, E.SUBJECT_INVALID_INPUT)
    }

    logger.error('subjects.create.exception', { error: String(error) })
    return fail('Failed to create subject', 500, E.INTERNAL_ERROR)
  }
}

export const POST = withRole('admin')(createSubjectHandler)
