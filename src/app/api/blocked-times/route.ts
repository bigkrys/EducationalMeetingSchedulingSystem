import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, AuthenticatedRequest } from '@/lib/api/middleware'
import { z } from 'zod'

// 验证模式
const blockedTimeSchema = z.object({
  teacherId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().optional()
})

// 获取阻塞时间
async function getBlockedTimesHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId')
    
    if (!teacherId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Teacher ID is required' },
        { status: 400 }
      )
    }

    const user = request.user!
    
    // 检查权限 - 教师只能查看自己的阻塞时间
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Teachers can only view their own blocked times' },
          { status: 403 }
        )
      }
    }

    const blockedTimes = await prisma.blockedTime.findMany({
      where: { teacherId },
      orderBy: { startTime: 'asc' }
    })

    return NextResponse.json({ blockedTimes })

  } catch (error) {
    console.error('Get blocked times error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to fetch blocked times' },
      { status: 500 }
    )
  }
}

// 创建阻塞时间
async function createBlockedTimeHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const user = request.user!
    const body = await request.json()
    const validatedData = blockedTimeSchema.parse(body)

    // 检查权限 - 教师只能为自己设置阻塞时间
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== validatedData.teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Teachers can only set blocked times for themselves' },
          { status: 403 }
        )
      }
    }

    // 验证时间逻辑
    const startTime = new Date(validatedData.startTime)
    const endTime = new Date(validatedData.endTime)
    
    if (startTime >= endTime) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    if (endTime.getTime() - startTime.getTime() < 15 * 60 * 1000) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Blocked time must be at least 15 minutes' },
        { status: 400 }
      )
    }

    // 检查是否与现有可用时间冲突（只检查周循环模式）
    const conflictingAvailability = await prisma.teacherAvailability.findMany({
      where: {
        teacherId: validatedData.teacherId,
        dayOfWeek: startTime.getDay(),
        isActive: true
      }
    })

    // 如果与 weekly availability 有冲突，不直接拒绝（允许共存），但记录冲突以返回前端提醒
    let availabilityConflicts: any[] = []
    if (conflictingAvailability.length > 0) {
      availabilityConflicts = conflictingAvailability
      console.log('Create blocked time - found conflicting weekly availability:', availabilityConflicts)
    }

    // 检查是否与现有预约冲突
    const conflictingAppointments = await prisma.appointment.findMany({
      where: {
        teacherId: validatedData.teacherId,
        scheduledTime: {
          gte: startTime,
          lt: endTime
        },
        status: { in: ['pending', 'approved'] }
      }
    })

    if (conflictingAppointments.length > 0) {
      // 生成用户友好的预约冲突信息
      const conflictDetails = conflictingAppointments.map(apt => {
        const date = new Date(apt.scheduledTime)
        const timeStr = date.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
        return `${timeStr} (${apt.durationMinutes}分钟)`
      }).join('、')
      
      return NextResponse.json({
        error: 'CONFLICT',
        message: `阻塞时间与现有预约冲突：${conflictDetails}`,
        conflicts: conflictingAppointments
      }, { status: 409 })
    }

    // 创建阻塞时间
    const blockedTime = await prisma.blockedTime.create({
      data: {
        teacherId: validatedData.teacherId,
        startTime,
        endTime,
        reason: validatedData.reason
      }
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'create_blocked_time',
        targetId: validatedData.teacherId,
        details: JSON.stringify(validatedData),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    })

    return NextResponse.json({ 
      ok: true, 
      blockedTime,
      // 把与 weekly availability 的冲突作为 warnings 返回给前端（非阻塞）
      availabilityConflicts,
      message: 'Blocked time created successfully'
    })

  } catch (error) {
    console.error('Create blocked time error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid input data', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to create blocked time' },
      { status: 500 }
    )
  }
}

// 删除阻塞时间
async function deleteBlockedTimeHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const blockedTimeId = searchParams.get('id')
    
    if (!blockedTimeId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Blocked time ID is required' },
        { status: 400 }
      )
    }

    const user = request.user!
    
    // 获取阻塞时间信息
    const blockedTime = await prisma.blockedTime.findUnique({
      where: { id: blockedTimeId }
    })

    if (!blockedTime) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Blocked time not found' },
        { status: 404 }
      )
    }

    // 检查权限 - 教师只能删除自己的阻塞时间
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== blockedTime.teacherId) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Teachers can only delete their own blocked times' },
          { status: 403 }
        )
      }
    }

    // 删除阻塞时间
    await prisma.blockedTime.delete({
      where: { id: blockedTimeId }
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'delete_blocked_time',
        targetId: blockedTimeId,
        details: JSON.stringify(blockedTime),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    })

    return NextResponse.json({ 
      ok: true, 
      message: 'Blocked time deleted successfully'
    })

  } catch (error) {
    console.error('Delete blocked time error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to delete blocked time' },
      { status: 500 }
    )
  }
}

// 导出处理函数
export const GET = withRole('teacher')(getBlockedTimesHandler)
export const POST = withRole('teacher')(createBlockedTimeHandler)
export const DELETE = withRole('teacher')(deleteBlockedTimeHandler)
