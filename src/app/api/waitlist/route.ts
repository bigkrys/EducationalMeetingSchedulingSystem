import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole, withRoles } from '@/lib/api/middleware'

// 获取候补队列
async function getWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')
    const teacherId = searchParams.get('teacherId')
    const status = searchParams.get('status') || 'waiting'

    if (!studentId && !teacherId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'studentId or teacherId is required' },
        { status: 400 }
      )
    }

    const where: any = { status }
    if (studentId) where.studentId = studentId
    if (teacherId) where.teacherId = teacherId

    const waitlistItems = await prisma.waitlist.findMany({
      where,
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    })

    return NextResponse.json({
      items: waitlistItems.map((item: any) => ({
        id: item.id,
        teacherId: item.teacherId,
        teacherName: item.teacher.user.name,
        studentId: item.studentId,
        studentName: item.student.user.name,
        date: item.date,
        slot: item.slot.toISOString(),
        priority: item.priority,
        status: item.status,
        createdAt: item.createdAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('Get waitlist error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to fetch waitlist' },
      { status: 500 }
    )
  }
}

// 添加到候补队列
async function addToWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { teacherId, date, slot, studentId, subject } = body

    if (!teacherId || !date || !slot || !studentId || !subject) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 检查学生是否已经在候补队列中
    const existingEntry = await prisma.waitlist.findFirst({
      where: {
        teacherId,
        studentId,
        date,
        slot: new Date(slot),
        status: 'waiting'
      }
    })

    if (existingEntry) {
      return NextResponse.json(
        { error: 'DUPLICATE_ENTRY', message: 'Student already in waitlist for this slot' },
        { status: 409 }
      )
    }

    // 获取学生信息，包括服务级别和userId
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { 
        serviceLevel: true,
        userId: true
      }
    })

    let priority = 0
    if (student?.serviceLevel === 'premium') {
      priority = 100
    } else if (student?.serviceLevel === 'level1') {
      priority = 50
    } else {
      priority = 10
    }

    // 创建候补队列条目
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        teacherId,
        studentId,
        date,
        slot: new Date(slot),
        priority,
        status: 'waiting'
      }
    })

    // 记录审计日志
    if (student?.userId) {
      await prisma.auditLog.create({
        data: {
          actorId: student.userId,
          action: 'WAITLIST_ADDED',
          targetId: waitlistEntry.id,
          details: JSON.stringify({
            teacherId,
            date,
            slot,
            subject,
            priority,
            reason: 'Student added to waitlist for unavailable slot'
          })
        }
      })
    }

    return NextResponse.json({
      message: 'Added to waitlist successfully',
      id: waitlistEntry.id,
      priority
    }, { status: 201 })

  } catch (error) {
    console.error('Add to waitlist error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to add to waitlist' },
      { status: 500 }
    )
  }
}

// 从候补队列移除
async function removeFromWaitlistHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { id, studentId } = body

    if (!id || !studentId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 验证权限（只能移除自己的条目）
    const waitlistEntry = await prisma.waitlist.findUnique({
      where: { id },
      include: { student: { include: { user: true } } }
    })

    if (!waitlistEntry) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Waitlist entry not found' },
        { status: 404 }
      )
    }

    if (waitlistEntry.studentId !== studentId) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cannot remove other student\'s waitlist entry' },
        { status: 403 }
      )
    }

    // 删除候补队列条目
    await prisma.waitlist.delete({
      where: { id }
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: studentId,
        action: 'WAITLIST_REMOVED',
        targetId: id,
        details: JSON.stringify({
          reason: 'Student removed from waitlist'
        })
      }
    })

    return NextResponse.json({
      message: 'Removed from waitlist successfully'
    })

  } catch (error) {
    console.error('Remove from waitlist error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to remove from waitlist' },
      { status: 500 }
    )
  }
}

export const GET = withRoles(['student', 'teacher'])(getWaitlistHandler)
export const POST = withRole('student')(addToWaitlistHandler)
export const DELETE = withRole('student')(removeFromWaitlistHandler)
