import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, AuthenticatedRequest } from '@/lib/api/middleware'
import { z } from 'zod'

// 验证模式 - 继续使用HH:mm格式，但加强时区处理说明
const availabilitySchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:mm格式
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),   // HH:mm格式
  isRecurring: z.boolean().optional().default(true),
  timezone: z.string().optional().default('Asia/Shanghai') // 用户时区
})

const batchAvailabilitySchema = z.object({
  timeSlots: z.array(availabilitySchema),
  action: z.enum(['replace', 'merge']).optional().default('replace'),
  timezone: z.string().optional().default('Asia/Shanghai')
})

// 获取教师可用性 - 返回时包含时区信息
async function getAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2]
    
    const user = request.user!

    // 权限检查
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // 获取可用性数据
    const availabilities = await prisma.teacherAvailability.findMany({
      where: {
        teacherId,
        isActive: true
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    })

    // 读取教师时区
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })

    return NextResponse.json({
      teacherId,
      availabilities,
      timezone: (teacher as any)?.timezone || 'UTC',
      note: 'Times are stored as local time strings (HH:mm). Frontend should handle timezone conversion for display.'
    })

  } catch (error) {
    console.error('Get availability error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to get availability' },
      { status: 500 }
    )
  }
}

// 设置教师可用性
async function setAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2]
    
    const user = request.user!
    const body = await request.json()
    const validatedData = availabilitySchema.parse(body)

    // 权限检查
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // 验证时间逻辑
    const startMinutes = timeToMinutes(validatedData.startTime)
    const endMinutes = timeToMinutes(validatedData.endTime)
    
    if (startMinutes >= endMinutes) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    const durationMinutes = endMinutes - startMinutes
    
    if (durationMinutes < 15) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Duration must be at least 15 minutes' },
        { status: 400 }
      )
    }

    if (durationMinutes > 480) { // 8小时
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Duration cannot exceed 8 hours' },
        { status: 400 }
      )
    }

    // 检查冲突
    const conflicts = await checkTimeConflicts(teacherId, validatedData)
    if (conflicts.length > 0) {
      return NextResponse.json(
        { 
          error: 'CONFLICT', 
          message: 'Time conflicts detected',
          conflicts 
        },
        { status: 409 }
      )
    }

    // 创建可用性记录
    const availability = await prisma.teacherAvailability.create({
      data: {
        teacherId,
        dayOfWeek: validatedData.dayOfWeek,
        startTime: validatedData.startTime,
        endTime: validatedData.endTime,
        isRecurring: validatedData.isRecurring,
        isActive: true
      }
    })

    return NextResponse.json({
      message: 'Availability set successfully',
      availability,
      timezone: validatedData.timezone
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Set availability error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to set availability' },
      { status: 500 }
    )
  }
}

// 批量设置可用性
async function batchSetAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2]
    
    const user = request.user!
    const body = await request.json()
    const validatedData = batchAvailabilitySchema.parse(body)

    // 权限检查
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Access denied' },
          { status: 403 }
        )
      }
    }

    // 如果是替换模式，先删除现有的可用性
    if (validatedData.action === 'replace') {
      await prisma.teacherAvailability.updateMany({
        where: { teacherId, isActive: true },
        data: { isActive: false }
      })
    }

    // 批量创建新的可用性记录
    const createdAvailabilities = []
    
    for (const timeSlot of validatedData.timeSlots) {
      // 基本验证
      const startMinutes = timeToMinutes(timeSlot.startTime)
      const endMinutes = timeToMinutes(timeSlot.endTime)
      
      if (startMinutes >= endMinutes) {
        continue // 跳过无效的时间段
      }

      const availability = await prisma.teacherAvailability.create({
        data: {
          teacherId,
          dayOfWeek: timeSlot.dayOfWeek,
          startTime: timeSlot.startTime,
          endTime: timeSlot.endTime,
          isRecurring: timeSlot.isRecurring ?? true,
          isActive: true
        }
      })

      createdAvailabilities.push(availability)
    }

    return NextResponse.json({
      message: 'Batch availability set successfully',
      availabilities: createdAvailabilities,
      action: validatedData.action,
      timezone: validatedData.timezone
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Batch set availability error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to batch set availability' },
      { status: 500 }
    )
  }
}

// 辅助函数：检查时间冲突
async function checkTimeConflicts(teacherId: string, newSlot: {
  dayOfWeek: number
  startTime: string
  endTime: string
}) {
  const conflicts = []

  // 检查与现有可用性的冲突
  const existingAvailabilities = await prisma.teacherAvailability.findMany({
    where: {
      teacherId,
      dayOfWeek: newSlot.dayOfWeek,
      isActive: true
    }
  })

  for (const existing of existingAvailabilities) {
    if (hasTimeOverlap(String((existing as any).startTime), String((existing as any).endTime), newSlot.startTime, newSlot.endTime)) {
      conflicts.push({
        type: 'availability_overlap',
        existingSlot: {
          id: existing.id,
          startTime: String((existing as any).startTime),
          endTime: String((existing as any).endTime)
        }
      })
    }
  }

  return conflicts
}

// 辅助函数：时间字符串转换为分钟数
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// 辅助函数：检查时间重叠（字符串版本）
function hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  
  return s1 < e2 && s2 < e1
}

// 导出处理函数
export const GET = withRole('teacher')(getAvailabilityHandler)
export const POST = withRole('teacher')(setAvailabilityHandler)
export const PUT = withRole('teacher')(batchSetAvailabilityHandler)
