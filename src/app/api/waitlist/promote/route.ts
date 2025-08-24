import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole } from '@/lib/api/middleware'

// 提升候补队列中的学生
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teacherId, slot, subject } = body

    if (!teacherId || !slot || !subject) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'teacherId, slot, and subject are required' },
        { status: 400 }
      )
    }

    const slotDate = new Date(slot)
    const dateStr = slotDate.toISOString().split('T')[0]

    // 查找候补队列中优先级最高的学生
    const waitlistEntry = await prisma.waitlist.findFirst({
      where: {
        teacherId,
        date: dateStr,
        slot: slotDate,

      },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } }
      },
      orderBy: [
        // 优先级排序需要根据学生的服务等级来实现
        { createdAt: 'asc' }
      ]
    })

    if (!waitlistEntry) {
      return NextResponse.json({
        message: 'No students in waitlist for this slot',
        promoted: 0
      })
    }

    // 检查学生是否还有月度配额
    const student = await prisma.student.findUnique({
      where: { id: waitlistEntry.studentId }
    })

    if (!student) {
      return NextResponse.json(
        { error: 'STUDENT_NOT_FOUND', message: 'Student not found' },
        { status: 404 }
      )
    }

    // 检查月度配额
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    if (student.lastQuotaReset < monthStart) {
      // 重置月度配额
      await prisma.student.update({
        where: { id: student.id },
        data: {
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date()
        }
      })
      student.monthlyMeetingsUsed = 0
    }

    // 检查是否超过月度配额限制
    const policy = await prisma.servicePolicy.findUnique({
      where: { level: student.serviceLevel }
    })
    
    let monthlyLimit = 10 // 默认限制
    if (policy) {
      if (student.serviceLevel === 'premium') {
        monthlyLimit = 999 // 高级学生无限制
      } else if (student.serviceLevel === 'level1') {
        monthlyLimit = 8 // 一级学生每月8次
      } else if (student.serviceLevel === 'level2') {
        monthlyLimit = 5 // 二级学生每月5次
      }
    }

    if (student.monthlyMeetingsUsed >= monthlyLimit) {
      // 学生没有配额，跳过并查找下一个
      // 学生没有配额，删除候补记录
      await prisma.waitlist.delete({
        where: { id: waitlistEntry.id }
      })

      // 递归调用，查找下一个学生
      return await promoteNextStudent(teacherId, slot, subject)
    }

    // 检查槽位是否仍然可用
    const conflictingAppointments = await prisma.appointment.findMany({
      where: {
        teacherId,
        scheduledTime: {
          gte: slotDate,
          lt: new Date(slotDate.getTime() + 30 * 60 * 1000) // 30分钟
        },
        status: { in: ['pending', 'approved'] }
      }
    })

    if (conflictingAppointments.length > 0) {
      return NextResponse.json({
        message: 'Slot is no longer available',
        promoted: 0
      })
    }

    // 根据服务级别决定是否需要审批
    let approvalRequired = true
    let status: 'pending' | 'approved' = 'pending'

    if (student.serviceLevel === 'premium') {
      approvalRequired = false
      status = 'approved'
    } else if (student.serviceLevel === 'level1') {
      // 检查是否还有自动批准次数
      const autoApproveLimit = policy?.monthlyAutoApprove || 2
      if (student.monthlyMeetingsUsed < autoApproveLimit) {
        approvalRequired = false
        status = 'approved'
      }
    }

    // 创建预约
    const appointment = await prisma.appointment.create({
      data: {
        studentId: waitlistEntry.studentId,
        teacherId,
        subjectId: await getSubjectIdByName(subject),
        scheduledTime: slotDate,
        durationMinutes: 30,
        status,
        approvalRequired,
        approvedAt: status === 'approved' ? new Date() : null,
        idempotencyKey: `waitlist_${waitlistEntry.id}_${Date.now()}`
      }
    })

    // 更新候补队列状态
    // 删除已提升的候补记录
    await prisma.waitlist.delete({
      where: { id: waitlistEntry.id }
    })

    // 更新学生月度使用次数
    await prisma.student.update({
      where: { id: student.id },
      data: { monthlyMeetingsUsed: { increment: 1 } }
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'WAITLIST_PROMOTED',
        targetId: appointment.id,
        details: JSON.stringify({
          waitlistId: waitlistEntry.id,
          studentId: waitlistEntry.studentId,
          studentName: waitlistEntry.student.user.name,
          teacherId: waitlistEntry.teacherId,
          teacherName: waitlistEntry.teacher.user.name,
          slot: slotDate.toISOString(),
          subject,
          status,
          reason: 'Student promoted from waitlist'
        })
      }
    })

    return NextResponse.json({
      message: 'Student promoted successfully',
      promoted: 1,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        approvalRequired: appointment.approvalRequired
      },
      student: {
        id: waitlistEntry.studentId,
        name: waitlistEntry.student.user.name,
        serviceLevel: student.serviceLevel
      }
    })

  } catch (error) {
    console.error('Promote waitlist error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to promote waitlist student' },
      { status: 500 }
    )
  }
}

// 递归查找下一个可提升的学生
async function promoteNextStudent(teacherId: string, slot: string, subject: string) {
  try {
    const slotDate = new Date(slot)
    const dateStr = slotDate.toISOString().split('T')[0]

    const nextEntry = await prisma.waitlist.findFirst({
      where: {
        teacherId,
        date: dateStr,
        slot: slotDate,

      },
      include: {
        student: { include: { user: true } }
      },
      orderBy: [
        // 优先级排序需要根据学生的服务等级来实现
        { createdAt: 'asc' }
      ]
    })

    if (!nextEntry) {
      return NextResponse.json({
        message: 'No more students in waitlist for this slot',
        promoted: 0
      })
    }

    // 递归调用提升逻辑
    return await promoteNextStudent(teacherId, slot, subject)
  } catch (error) {
    console.error('Promote next student error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to promote next student' },
      { status: 500 }
    )
  }
}

// 根据科目名称获取科目ID
async function getSubjectIdByName(subjectName: string): Promise<string> {
  const subject = await prisma.subject.findFirst({
    where: { name: subjectName }
  })
  
  if (!subject) {
    throw new Error(`Subject not found: ${subjectName}`)
  }
  
  return subject.id
}
