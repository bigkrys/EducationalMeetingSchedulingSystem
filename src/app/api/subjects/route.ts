import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole } from '@/lib/api/middleware'
import { z } from 'zod'

// 科目验证 schema
const subjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).regex(/^[A-Z_]+$/, 'Code must be uppercase letters and underscores only'),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
})

// 获取所有科目
export async function GET() {
  try {
    const subjects = await prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json(subjects)
  } catch (error) {
    console.error('Get subjects error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to fetch subjects' },
      { status: 500 }
    )
  }
}

// 创建新科目
async function createSubjectHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const validatedData = subjectSchema.parse(body)

    // 检查科目名称和代码是否已存在
    const existingSubject = await prisma.subject.findFirst({
      where: {
        OR: [
          { name: validatedData.name },
          { code: validatedData.code }
        ]
      }
    })

    if (existingSubject) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Subject name or code already exists' },
        { status: 409 }
      )
    }

    const subject = await prisma.subject.create({
      data: validatedData
    })

    // 记录审计日志
    const user = (request as any).user
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'create_subject',
        targetId: subject.id,
        details: JSON.stringify(validatedData)
      }
    })

    return NextResponse.json(subject, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid input data' },
        { status: 400 }
      )
    }

    console.error('Create subject error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to create subject' },
      { status: 500 }
    )
  }
}

export const POST = withRole('admin')(createSubjectHandler)
