import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { updateAppointmentSchema } from '@/lib/api/validation'
import { withRoles } from '@/lib/api/middleware'
import { deleteCachePattern } from '@/lib/api/cache'
import {
  sendAppointmentApprovedNotification,
  sendAppointmentCancelledNotification,
  sendAppointmentRejectedNotification,
  sendNewAppointmentRequestNotification,
  sendAppointmentRequestSubmittedNotification,
} from '@/lib/api/email'
import { promoteForSlotTx } from '@/lib/waitlist/promotion'
import { z } from 'zod'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

// 更新预约状态
async function updateAppointmentHandler(
  request: NextRequest,
  context: { params?: { id?: string } }
) {
  try {
    const appointmentId = (context as any)?.params?.id
    const body = await request.json()
    const validatedData = updateAppointmentSchema.parse(body)

    // 获取预约信息
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
      },
    })

    if (!appointment) {
      return fail('Appointment not found', 404, E.NOT_FOUND)
    }

    // 检查权限
    const user = (request as any).user
    if (user.role === 'student') {
      // 查找当前用户对应的学生记录
      const currentStudent = await prisma.student.findUnique({
        where: { userId: user.userId },
      })

      if (!currentStudent) {
        return fail('Student record not found', 403, E.FORBIDDEN)
      }

      if (appointment.studentId !== currentStudent.id) {
        return fail("Cannot modify other students' appointments", 403, E.FORBIDDEN)
      }
    }

    if (user.role === 'teacher') {
      // 查找当前用户对应的教师记录
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId },
      })

      if (!currentTeacher) {
        return fail('Teacher record not found', 403, E.FORBIDDEN)
      }

      if (appointment.teacherId !== currentTeacher.id) {
        return fail("Cannot modify other teachers' appointments", 403, E.FORBIDDEN)
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
            approvedAt: new Date(),
          }
          canUpdate = true
        }
        break

      case 'reject':
        if (user.role === 'teacher' && appointment.status === 'pending') {
          if (!validatedData.reason) {
            return fail(
              'Reason is required for rejection',
              400,
              'APPOINTMENT_REJECT_REASON_REQUIRED'
            )
          }
          updateData = {
            status: 'rejected',
          }
          canUpdate = true
        }
        break

      case 'cancel':
        if (appointment.status === 'pending' || appointment.status === 'approved') {
          updateData = {
            status: 'cancelled',
          }
          canUpdate = true
        }
        break

      case 'complete':
        if (user.role === 'teacher' && appointment.status === 'approved') {
          updateData = {
            status: 'completed',
          }
          canUpdate = true
        }
        break

      case 'no_show':
        if (user.role === 'teacher' && appointment.status === 'approved') {
          updateData = {
            status: 'no_show',
          }
          canUpdate = true
        }
        break
    }

    if (!canUpdate) {
      return fail(
        'Cannot perform this action on current appointment status',
        409,
        'APPOINTMENT_STATE_CONFLICT'
      )
    }

    // 更新预约
    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
    })

    // 清除相关缓存
    const dateStr = appointment.scheduledTime.toISOString().split('T')[0]
    await deleteCachePattern(`slots:${appointment.teacherId}:${dateStr}:*`)

    // 发送邮件通知
    if (validatedData.action === 'approve' && appointment.status === 'pending') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId },
        })

        if (subject) {
          const _sendApprovalNotifications = async () => {
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
                    timeZone: appointment.teacher?.timezone || 'UTC',
                  }),
                  durationMinutes: appointment.durationMinutes,
                }
              )
            } catch (error) {
              logger.error('appointment.notify.approval.failed', { error: String(error) })
            }
          }

          if (process.env.SEND_EMAIL_SYNC === 'true') {
            await _sendApprovalNotifications()
          } else {
            _sendApprovalNotifications().catch((err) =>
              logger.error('appointment.notify.approval.async_failed', { error: String(err) })
            )
          }
        }
      } catch (error) {
        logger.error('appointment.notify.approval.prepare_failed', { error: String(error) })
      }
    }

    // 发送拒绝通知邮件
    if (validatedData.action === 'reject' && appointment.status === 'pending') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId },
        })

        if (subject) {
          const _sendRejectionNotifications = async () => {
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
                    timeZone: appointment.teacher?.timezone || 'UTC',
                  }),
                  reason: validatedData.reason || '未提供原因',
                }
              )
            } catch (error) {
              logger.error('appointment.notify.reject.failed', { error: String(error) })
            }
          }

          if (process.env.SEND_EMAIL_SYNC === 'true') {
            await _sendRejectionNotifications()
          } else {
            _sendRejectionNotifications().catch((err) =>
              logger.error('appointment.notify.reject.async_failed', { error: String(err) })
            )
          }
        }
      } catch (error) {
        logger.error('appointment.notify.reject.prepare_failed', { error: String(error) })
      }
    }

    // 发送取消通知邮件
    if (validatedData.action === 'cancel' && appointment.status !== 'cancelled') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId },
        })

        if (subject) {
          const _sendCancelNotifications = async () => {
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
                    timeZone: appointment.teacher?.timezone || 'UTC',
                  }),
                  reason: validatedData.reason,
                }
              )
            } catch (error) {
              logger.error('appointment.notify.cancel.failed', { error: String(error) })
            }
          }

          if (process.env.SEND_EMAIL_SYNC === 'true') {
            await _sendCancelNotifications()
          } else {
            _sendCancelNotifications().catch((err) =>
              logger.error('appointment.notify.cancel.async_failed', { error: String(err) })
            )
          }
        }
      } catch (error) {
        logger.error('appointment.notify.cancel.prepare_failed', { error: String(error) })
      }
    }

    // 如果预约被取消，尝试提升候补队列中的学生
    if (validatedData.action === 'cancel' && appointment.status !== 'cancelled') {
      try {
        // 获取科目名称
        const subject = await prisma.subject.findUnique({
          where: { id: appointment.subjectId },
        })

        if (subject) {
          // 方式一：本地直接调用事务（避免 HTTP/job-auth 问题），不阻塞响应
          ;(async () => {
            try {
              const res = await prisma.$transaction((tx) =>
                promoteForSlotTx(
                  tx,
                  appointment.teacherId as string,
                  appointment.scheduledTime as Date,
                  subject.name
                )
              )
              if (res.promoted > 0) {
                await deleteCachePattern(`slots:${appointment.teacherId}:${dateStr}:*`)

                // 直接晋升成功后，发送相同的通知邮件（不依赖 HTTP 路由）
                try {
                  const appt = await prisma.appointment.findUnique({
                    where: { id: res.appointmentId as string },
                    include: {
                      student: { include: { user: true } },
                      teacher: { include: { user: true } },
                      subject: true,
                    },
                  })
                  if (appt && appt.student?.user && appt.teacher?.user) {
                    const scheduledLocal = (appointment.scheduledTime as Date).toLocaleString(
                      'zh-CN',
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: (appt.teacher as any)?.timezone || 'UTC',
                      }
                    )

                    if (res.status === 'pending') {
                      const p1 = sendNewAppointmentRequestNotification(appt.teacher.user.email, {
                        studentName: appt.student.user.name,
                        subject: appt.subject.name,
                        scheduledTime: scheduledLocal,
                        durationMinutes: appt.durationMinutes,
                        studentEmail: appt.student.user.email,
                      })
                      const p2 = sendAppointmentRequestSubmittedNotification(
                        appt.student.user.email,
                        {
                          studentName: appt.student.user.name,
                          teacherName: appt.teacher.user.name,
                          subject: appt.subject.name,
                          scheduledTime: scheduledLocal,
                          durationMinutes: appt.durationMinutes,
                        }
                      )
                      if (process.env.SEND_EMAIL_SYNC === 'true') {
                        await p1
                        await p2
                      } else {
                        p1.catch((e) =>
                          logger.error('waitlist.promote.email.request_failed', {
                            error: String(e),
                          })
                        )
                        p2.catch((e) =>
                          logger.error('waitlist.promote.email.request_student_failed', {
                            error: String(e),
                          })
                        )
                      }
                    } else {
                      const fn = async () =>
                        await sendAppointmentApprovedNotification(
                          appt.student.user.email,
                          appt.teacher.user.email,
                          {
                            studentName: appt.student.user.name,
                            teacherName: appt.teacher.user.name,
                            subject: appt.subject.name,
                            scheduledTime: scheduledLocal,
                            durationMinutes: appt.durationMinutes,
                          }
                        )
                      if (process.env.SEND_EMAIL_SYNC === 'true') await fn()
                      else
                        fn().catch((e) =>
                          logger.error('waitlist.promote.email.approved_failed', {
                            error: String(e),
                          })
                        )
                    }
                  }
                } catch (e) {
                  logger.error('waitlist.promote.email.direct.exception', { error: String(e) })
                }
              }
            } catch (err) {
              logger.error('waitlist.promote.invoke_direct_failed', { error: String(err) })
            }
          })()

          // 方式二：HTTP 触发（作为冗余，某些部署更易观测日志与鉴权）
          setTimeout(async () => {
            try {
              const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/waitlist/promote`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    // Use job-auth compatible secret; fallback to INTERNAL_API_KEY for local
                    Authorization: `Bearer ${process.env.JOB_TRIGGER_SECRET || process.env.INTERNAL_API_KEY || 'internal-key'}`,
                    'x-job-secret': `${process.env.JOB_TRIGGER_SECRET || ''}`,
                  },
                  body: JSON.stringify({
                    teacherId: appointment.teacherId,
                    slot: appointment.scheduledTime.toISOString(),
                    subject: subject.name,
                  }),
                }
              )

              if (response.ok) {
                const result = await response.json()

                // 如果成功提升，清除相关缓存
                if (result.promoted > 0) {
                  await deleteCachePattern(`slots:${appointment.teacherId}:${dateStr}:*`)
                }
              }
            } catch (error) {
              logger.error('waitlist.promote.invoke_failed', { error: String(error) })
            }
          }, 500) // 轻微延迟，确保上面的更新已提交
        }
      } catch (error) {
        logger.error('waitlist.promote.trigger_failed', { error: String(error) })
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
          waitlistPromotionTriggered: validatedData.action === 'cancel',
        }),
      },
    })

    return ok()
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid input data', 400, E.BAD_REQUEST)
    }

    logger.error('appointment.update.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })
    return fail('Failed to update appointment', 500, E.INTERNAL_ERROR)
  }
}

export const PATCH = withRoles(['student', 'teacher'])(updateAppointmentHandler)
