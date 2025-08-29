import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { addHours, subHours } from 'date-fns'

export async function POST(request: NextRequest) {
  try {
    // 验证触发密钥
    const headerSecret = request.headers.get('x-job-secret') || ''
    const auth = request.headers.get('authorization') || ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const triggerSecret = process.env.JOB_TRIGGER_SECRET || ''
    if (!triggerSecret || (headerSecret !== triggerSecret && bearer !== triggerSecret)) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Invalid or missing job trigger secret' }, { status: 401 })
    }

    const body = await request.json()
    const { offsetHours } = body

    if (!offsetHours || ![1, 24].includes(offsetHours)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'offsetHours must be 1 or 24' },
        { status: 400 }
      )
    }

    // 计算需要发送提醒的时间范围
    const now = new Date()
    const reminderStart = addHours(now, offsetHours)
    const reminderEnd = addHours(now, offsetHours + 1) // 1小时窗口

    // 查找需要发送提醒的预约
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledTime: {
          gte: reminderStart,
          lt: reminderEnd
        },
        status: 'approved',
        // 避免重复发送提醒
        id: {
          notIn: await getAlreadyRemindedAppointments(offsetHours)
        }
      },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
        subject: true
      }
    })

    if (appointments.length === 0) {
      return NextResponse.json({
        message: `No appointments need ${offsetHours}h reminder`,
        sent: 0
      })
    }

    // 发送提醒并记录
    const reminderPromises = appointments.map(async (appointment: any) => {
      try {
        // 发送提醒（这里模拟发送，实际可以集成邮件、短信等）
        await sendReminder(appointment, offsetHours)
        
        // 记录提醒发送
        await prisma.auditLog.create({
          data: {
            action: 'REMINDER_SENT',
            targetId: appointment.id,
            details: JSON.stringify({
              appointmentId: appointment.id,
              studentId: appointment.studentId,
              studentName: appointment.student.user.name,
              teacherId: appointment.teacherId,
              teacherName: appointment.teacher.user.name,
              scheduledTime: appointment.scheduledTime.toISOString(),
              subject: appointment.subject.name,
              offsetHours,
              reminderType: offsetHours === 24 ? 'day_before' : 'hour_before'
            })
          }
        })

        return { success: true, appointmentId: appointment.id }
      } catch (error) {
        console.error(`Failed to send reminder for appointment ${appointment.id}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, appointmentId: appointment.id, error: errorMessage }
      }
    })

    const results = await Promise.all(reminderPromises)
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      message: `Reminders sent successfully`,
      sent: successful,
      failed,
      total: appointments.length,
      offsetHours,
      results: {
        successful: results.filter(r => r.success).map(r => r.appointmentId),
        failed: results.filter(r => !r.success).map(r => ({ id: r.appointmentId, error: r.error }))
      }
    })

  } catch (error) {
    console.error('Send reminders error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send reminders' },
      { status: 500 }
    )
  }
}

// 获取已经发送过提醒的预约ID列表
async function getAlreadyRemindedAppointments(offsetHours: number): Promise<string[]> {
  const oneDayAgo = subHours(new Date(), 24)
  
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'REMINDER_SENT',
      createdAt: { gte: oneDayAgo },
      details: {
        contains: `"offsetHours":${offsetHours}`
      }
    },
    select: { targetId: true }
  })

  return logs.map(log => log.targetId).filter((id): id is string => id !== null)
}

// 发送提醒的函数（模拟实现）
async function sendReminder(appointment: any, offsetHours: number): Promise<void> {
  const reminderType = offsetHours === 24 ? '24小时前' : '1小时前'
  
  // 这里可以集成实际的提醒系统
  // 例如：发送邮件、短信、推送通知等
 

  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 100))
}
