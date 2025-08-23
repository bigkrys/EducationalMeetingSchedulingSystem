import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { updateAppointmentSchema } from '@/lib/api/validation'
import { withRoles } from '@/lib/api/middleware'
import { deleteCachePattern } from '@/lib/api/cache'
import { sendAppointmentApprovedNotification, sendAppointmentCancelledNotification } from '@/lib/api/email'
import { z } from 'zod'

// 更新预约状态
async function updateAppointmentHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const appointmentId = params.id
    const body = await request.json()
    const validatedData = updateAppointmentSchema.parse(body)

    // 获取预约信息
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } }
      }
    })

    if (!appointment) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Appointment not found' },
        { status: 404 }
      )
    }

    // 检查权限
    const user = (request as any).user
    if (user.role === 'student') {
      // 查找当前用户对应的学生记录
      const currentStudent = await prisma.student.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentStudent) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Student record not found' },
          { status: 403 }
        )
      }
      
      if (appointment.studentId !== currentStudent.id) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Cannot modify other students\' appointments' },
          { status: 403 }
        )
      }
    }

    if (user.role === 'teacher') {
      // 查找当前用户对应的教师记录
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Teacher record not found' },
          { status: 403 }
        )
      }
      
      if (appointment.teacherId !== currentTeacher.id) {
        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Cannot modify other teachers\' appointments' },
          { status: 403 }
        )
      }
    }

    // 根据操作类型更新状态
    let updateData: any = {}
    let canUpdate = false

    switch (validatedData.action) {
      case 'approve':
        if (user.role === 'teacher' && appointment.status === 'pending') {
          updateData = {
            status: 'approved',
            approvedAt: new Date()
          }
          canUpdate = true
        }
        break

      case 'reject':
        if (user.role === 'teacher' && appointment.status === 'pending') {
          if (!validatedData.reason) {
            return NextResponse.json(
              { error: 'BAD_REQUEST', message: 'Reason is required for rejection' },
              { status: 400 }
            )
          }
          updateData = {
            status: 'rejected'
          }
          canUpdate = true
        }
        break

      case 'cancel':
        if (appointment.status === 'pending' || appointment.status === 'approved') {
          updateData = {
            status: 'cancelled'
          }
          canUpdate = true
        }
        break

      case 'complete':
        if (user.role === 'teacher' && appointment.status === 'approved') {
          updateData = {
            status: 'completed'
          }
          canUpdate = true
        }
        break

      case 'no_show':
        if (user.role === 'teacher' && appointment.status === 'approved') {
          updateData = {
            status: 'no_show'
          }
          canUpdate = true
        }
        break
    }

    if (!canUpdate) {
      return NextResponse.json(
        { error: 'STATE_CONFLICT', message: 'Cannot perform this action on current appointment status' },
        { status: 409 }
      )
    }

    // 更新预约
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData
    })

    // 清除相关缓存
    const dateStr = appointment.scheduledTime.toISOString().split('T')[0]
    await deleteCachePattern(`slots:${appointment.teacherId}:${dateStr}:*`)

    // 发送邮件通知
    if (validatedData.action === 'approve' && appointment.status === 'pending') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId }
        })

        if (subject) {
          // 异步发送邮件通知（不阻塞响应）
          setTimeout(async () => {
            try {
              await sendAppointmentApprovedNotification(
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
                  }),
                  durationMinutes: appointment.durationMinutes
                }
              )
            } catch (error) {
              console.error('Failed to send approval notification emails:', error)
            }
          }, 1000) // 延迟1秒执行，确保预约更新完成
        }
      } catch (error) {
        console.error('Failed to prepare approval notification emails:', error)
      }
    }

    // 发送拒绝通知邮件
    if (validatedData.action === 'reject' && appointment.status === 'pending') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId }
        })

        if (subject) {
          // 异步发送邮件通知（不阻塞响应）
          setTimeout(async () => {
            try {
              await sendAppointmentRejectedNotification(
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
                  }),
                  reason: validatedData.reason || '未提供原因'
                }
              )
            } catch (error) {
              console.error('Failed to send rejection notification emails:', error)
            }
          }, 1000) // 延迟1秒执行，确保预约更新完成
        }
      } catch (error) {
        console.error('Failed to prepare rejection notification emails:', error)
      }
    }

    // 发送取消通知邮件
    if (validatedData.action === 'cancel' && appointment.status !== 'cancelled') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId }
        })

        if (subject) {
          // 异步发送邮件通知（不阻塞响应）
          setTimeout(async () => {
            try {
              await sendAppointmentCancelledNotification(
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
                  }),
                  reason: validatedData.reason
                }
              )
            } catch (error) {
              console.error('Failed to send cancellation notification emails:', error)
            }
          }, 1000) // 延迟1秒执行，确保预约更新完成
        }
      } catch (error) {
        console.error('Failed to prepare cancellation notification emails:', error)
      }
    }

    // 如果预约被取消，尝试提升候补队列中的学生
    if (validatedData.action === 'cancel' && appointment.status !== 'cancelled') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId }
        })

        if (subject) {
          // 异步调用候补队列提升（不阻塞响应）
          setTimeout(async () => {
            try {
              const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/waitlist/promote`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-key'}`
                },
                body: JSON.stringify({
                  teacherId: appointment.teacherId,
                  slot: appointment.scheduledTime.toISOString(),
                  subject: subject.name
                })
              })

              if (response.ok) {
                const result = await response.json()
                console.log('Waitlist promotion result:', result)
                
                // 如果成功提升，清除相关缓存
                if (result.promoted > 0) {
                  await deleteCachePattern(`slots:${appointment.teacherId}:${dateStr}:*`)
                }
              }
            } catch (error) {
              console.error('Waitlist promotion error:', error)
            }
          }, 1000) // 延迟1秒执行，确保预约更新完成
        }
      } catch (error) {
        console.error('Failed to trigger waitlist promotion:', error)
      }
    }

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: `appointment_${validatedData.action}`,
        targetId: appointmentId,
        details: JSON.stringify({
          previousStatus: appointment.status,
          newStatus: updatedAppointment.status,
          reason: validatedData.reason,
          waitlistPromotionTriggered: validatedData.action === 'cancel'
        })
      }
    })

    return NextResponse.json({ ok: true })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid input data' },
        { status: 400 }
      )
    }

    console.error('Update appointment error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to update appointment' },
      { status: 500 }
    )
  }
}

export const PATCH = withRoles(['student', 'teacher'])(updateAppointmentHandler)
