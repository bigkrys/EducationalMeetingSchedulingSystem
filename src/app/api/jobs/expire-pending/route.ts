import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { sendAppointmentExpiredNotification } from '@/lib/api/email'

export async function POST(request: NextRequest) {
  try {
    // 计算48小时前的时间
    const expireTime = new Date()
    expireTime.setHours(expireTime.getHours() - 48)

    // 查找需要过期的待审批预约
    const expiredAppointments = await prisma.appointment.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: expireTime }
      },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } }
      }
    })

    if (expiredAppointments.length === 0) {
      return NextResponse.json({
        message: 'No pending appointments need to expire',
        updated: 0
      })
    }

    // 批量更新过期预约
    const updatePromises = expiredAppointments.map((appointment: any) => 
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'expired' }
      })
    )

    await Promise.all(updatePromises)

    // 发送过期通知邮件
    const emailPromises = expiredAppointments.map(async (appointment: any) => {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId }
        })

        if (subject) {
          await sendAppointmentExpiredNotification(
            appointment.student.user.email,
            appointment.teacher.user.email,
            {
              studentName: appointment.student.user.name,
              teacherName: appointment.teacher.user.name,
              subject: subject.name,
              scheduledTime: appointment.scheduledTime.toLocaleString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Shanghai'
              })
            }
          )
        }
      } catch (error) {
        console.error(`Failed to send expired notification for appointment ${appointment.id}:`, error)
      }
    })

    await Promise.all(emailPromises)

    // 记录审计日志
    const auditLogPromises = expiredAppointments.map((appointment: any) =>
      prisma.auditLog.create({
        data: {
          action: 'APPOINTMENT_EXPIRED',
          targetId: appointment.id,
          details: JSON.stringify({
            appointmentId: appointment.id,
            studentId: appointment.studentId,
            studentName: appointment.student.user.name,
            teacherId: appointment.teacherId,
            teacherName: appointment.teacher.user.name,
            scheduledTime: appointment.scheduledTime.toISOString(),
            expiredAt: new Date().toISOString(),
            reason: '48 hours timeout without teacher approval'
          })
        }
      })
    )

    await Promise.all(auditLogPromises)

    // 清除相关缓存
    const cacheClearPromises = expiredAppointments.map((appointment: any) => {
      const dateStr = appointment.scheduledTime.toISOString().split('T')[0]
      return prisma.$executeRaw`SELECT 1` // 这里可以调用缓存清理函数
    })

    await Promise.all(cacheClearPromises)

    return NextResponse.json({
      message: 'Pending appointments expired successfully',
      updated: expiredAppointments.length,
      expiredAt: new Date().toISOString(),
      details: {
        totalExpired: expiredAppointments.length,
        appointments: expiredAppointments.map((apt: any) => ({
          id: apt.id,
          studentName: apt.student.user.name,
          teacherName: apt.teacher.user.name,
          scheduledTime: apt.scheduledTime.toISOString()
        }))
      }
    })

  } catch (error) {
    console.error('Expire pending appointments error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to expire pending appointments' },
      { status: 500 }
    )
  }
}
