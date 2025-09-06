import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { createAppointmentSchema, appointmentsQuerySchema } from '@/lib/api/validation'
import { withRole, withRoles } from '@/lib/api/middleware'
import { deleteCachePattern } from '@/lib/api/cache'
import { z } from 'zod'
import { addMinutes, isBefore, isAfter } from 'date-fns'
import {
  sendNewAppointmentRequestNotification,
  sendAppointmentApprovedNotification,
} from '@/lib/api/email'
import { withRateLimit } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'

// 查询预约列表
async function getAppointmentsHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const queryData = {
      role: searchParams.get('role'),
      studentId: searchParams.get('studentId'),
      teacherId: searchParams.get('teacherId'),
      status: searchParams.get('status'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      cursor: searchParams.get('cursor'),
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    }

    // 验证必需参数
    if (!queryData.role) {
      return fail('Role is required', 400, 'BAD_REQUEST')
    }

    if (queryData.role === 'student' && !queryData.studentId) {
      return fail('StudentId is required for student role', 400, 'BAD_REQUEST')
    }

    if (queryData.role === 'teacher' && !queryData.teacherId) {
      return fail('TeacherId is required for teacher role', 400, 'BAD_REQUEST')
    }

    // 验证UUID格式（如果提供了的话）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    if (queryData.studentId && !uuidRegex.test(queryData.studentId)) {
      return fail('Invalid studentId format', 400, 'BAD_REQUEST')
    }

    if (queryData.teacherId && !uuidRegex.test(queryData.teacherId)) {
      return fail('Invalid teacherId format', 400, 'BAD_REQUEST')
    }

    // 构建查询条件
    const where: Record<string, any> = {}

    if (queryData.role === 'student' && queryData.studentId) {
      // 如果是学生角色，需要根据User ID查找对应的Student ID
      const student = await prisma.student.findUnique({
        where: { userId: queryData.studentId },
      })

      if (!student) {
        return fail('Student not found for this user', 400, 'BAD_REQUEST')
      }

      where.studentId = student.id
    } else if (queryData.role === 'teacher' && queryData.teacherId) {
      // 如果是教师角色，需要根据User ID查找对应的Teacher ID
      const teacher = await prisma.teacher.findUnique({
        where: { userId: queryData.teacherId },
      })

      if (!teacher) {
        return fail('Teacher not found for this user', 400, 'BAD_REQUEST')
      }

      where.teacherId = teacher.id
    }

    if (queryData.status) {
      where.status = queryData.status
    }

    if (queryData.from || queryData.to) {
      where.scheduledTime = {}
      if (queryData.from) {
        where.scheduledTime.gte = new Date(queryData.from)
      }
      if (queryData.to) {
        where.scheduledTime.lte = new Date(queryData.to)
      }
    }

    // 构建分页
    const take = queryData.limit
    const skip = 0

    if (queryData.cursor) {
      // 简单的游标分页实现
      const cursorAppointment = await prisma.appointment.findUnique({
        where: { id: queryData.cursor },
      })

      if (cursorAppointment) {
        where.scheduledTime = {
          gt: cursorAppointment.scheduledTime,
        }
      }
    }

    // 查询预约
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
        subject: true,
      },
      orderBy: { scheduledTime: 'asc' },
      take: take + 1, // 多取一个来判断是否有下一页
      skip,
    })
    // 判断是否有下一页
    const hasNext = appointments.length > take
    const items = appointments.slice(0, take)
    const nextCursor = hasNext ? items[items.length - 1]?.id : null

    return ok({
      items: items.map((apt: any) => ({
        id: apt.id,
        scheduledTime: apt.scheduledTime.toISOString(),
        status: apt.status,
        subject: apt.subject.name,
        durationMinutes: apt.durationMinutes,
        approvalRequired: apt.approvalRequired,
        approvedAt: apt.approvedAt?.toISOString(),
        createdAt: apt.createdAt.toISOString(),
        studentId: apt.student.id,
        studentName: apt.student.user.name,
        teacherId: apt.teacher.id,
        teacherName: apt.teacher.user.name,
        student: {
          id: apt.student.id,
          name: apt.student.user.name,
          serviceLevel: apt.student.serviceLevel,
        },
        teacher: {
          id: apt.teacher.id,
          name: apt.teacher.user.name,
        },
      })),
      nextCursor,
    })
  } catch (error) {
    logger.error('appointments.list.exception', { error: String(error) })
    return fail('Failed to fetch appointments', 500, 'INTERNAL_ERROR')
  }
}

// 创建预约
async function createAppointmentHandler(request: NextRequest, context?: any) {
  try {
    let emailDebug: any = undefined
    const body = await request.json()
    const validatedData = createAppointmentSchema.parse(body)

    // 检查幂等性
    const existingAppointment = await prisma.appointment.findUnique({
      where: { idempotencyKey: validatedData.idempotencyKey },
    })

    if (existingAppointment) {
      // 已存在相同 idempotencyKey 的预约：返回现有预约信息以支持幂等重试
      const apt = await prisma.appointment.findUnique({
        where: { id: existingAppointment.id },
        include: {
          student: { include: { user: true } },
          teacher: { include: { user: true } },
          subject: true,
        },
      })
      if (apt) {
        return ok(
          {
            id: apt.id,
            scheduledTime: apt.scheduledTime.toISOString(),
            status: apt.status,
            subject: apt.subject?.name,
            durationMinutes: apt.durationMinutes,
            approvalRequired: apt.approvalRequired,
            approvedAt: apt.approvedAt?.toISOString(),
            createdAt: apt.createdAt.toISOString(),
            studentId: apt.student?.id,
            studentName: apt.student?.user?.name,
            teacherId: apt.teacher?.id,
            teacherName: apt.teacher?.user?.name,
          },
          { status: 200 }
        )
      }
    }

    // 检查学生是否存在且为激活状态
    const student = await prisma.student.findUnique({
      where: { id: validatedData.studentId },
      include: { user: true },
    })

    if (!student || student.user.status !== 'active') {
      return fail('Student not found or inactive', 400, 'BAD_REQUEST')
    }

    // 检查教师是否存在
    const teacher = await prisma.teacher.findUnique({
      where: { id: validatedData.teacherId },
      include: { user: true },
    })

    if (!teacher || teacher.user.status !== 'active') {
      return fail('Teacher not found or inactive', 400, 'BAD_REQUEST')
    }

    // 检查科目是否匹配
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: validatedData.teacherId,
        subject: {
          name: validatedData.subject,
        },
      },
    })

    if (!teacherSubject) {
      return fail('Teacher does not teach this subject', 400, 'SUBJECT_MISMATCH')
    }

    // 检查学生是否已注册该科目
    const studentSubject = await prisma.studentSubject.findFirst({
      where: {
        studentId: validatedData.studentId,
        subject: {
          name: validatedData.subject,
        },
      },
    })

    if (!studentSubject) {
      return fail('Student is not enrolled in this subject', 400, 'SUBJECT_MISMATCH')
    }

    // 首先查找或创建科目（需要在事务前准备好 subject.id）
    let subject = await prisma.subject.findFirst({ where: { name: validatedData.subject } })
    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: validatedData.subject,
          code: validatedData.subject.toUpperCase().replace(/\s+/g, '_'),
          description: `科目：${validatedData.subject}`,
        },
      })
    }

    // 检查槽位并创建预约（使用事务与行锁序列化同一教师的并发请求）
    // 标准化 scheduledTime 到分钟精度，避免微秒/秒差异导致并发时写入不同的 timestamp
    const scheduledTime = new Date(validatedData.scheduledTime)
    scheduledTime.setSeconds(0, 0)
    const slotEnd = addMinutes(scheduledTime, validatedData.durationMinutes)

    // 冲突/创建逻辑在事务内执行，以避免检查-创建之间的竞态。
    let appointment: any = undefined
    try {
      appointment = await prisma.$transaction(async (tx) => {
        // 重新读取可能被并发修改的数据（学生记录、教师行等）
        const txTeacher = await tx.teacher.findUnique({ where: { id: validatedData.teacherId } })
        if (!txTeacher) {
          throw new Error('TEACHER_NOT_FOUND_TX')
        }

        const txStudent = await tx.student.findUnique({ where: { id: validatedData.studentId } })
        if (!txStudent) {
          throw new Error('STUDENT_NOT_FOUND_TX')
        }

        // 计算缓冲区并检查冲突（使用事务视图上的数据）
        const bufferStart = addMinutes(scheduledTime, -txTeacher.bufferMinutes)
        const bufferEnd = addMinutes(slotEnd, txTeacher.bufferMinutes)

        const conflictingAppointments = await tx.appointment.findMany({
          where: {
            teacherId: validatedData.teacherId,
            scheduledTime: { lt: bufferEnd },
            status: { in: ['pending', 'approved'] },
          },
        })

        const hasConflict = conflictingAppointments.some((appt: any) => {
          const appointmentEnd = addMinutes(appt.scheduledTime, appt.durationMinutes)
          return bufferStart < appointmentEnd && bufferEnd > appt.scheduledTime
        })

        if (hasConflict) {
          // 使用特定错误标识，让外层捕获并返回友好消息
          const e: any = new Error('SLOT_TAKEN_TX')
          e.code = 'SLOT_TAKEN_TX'
          throw e
        }

        // 检查教师当日预约数量限制（基于事务视图）
        const dayStart = new Date(scheduledTime)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(scheduledTime)
        dayEnd.setHours(23, 59, 59, 999)

        const dailyAppointments = await tx.appointment.count({
          where: {
            teacherId: validatedData.teacherId,
            scheduledTime: { gte: dayStart, lte: dayEnd },
            status: { in: ['pending', 'approved'] },
          },
        })

        if (dailyAppointments >= txTeacher.maxDailyMeetings) {
          const e: any = new Error('MAX_DAILY_REACHED_TX')
          e.code = 'MAX_DAILY_REACHED_TX'
          throw e
        }

        // 在事务中重新计算/重置学生月度配额（以防并发修改）
        const now = new Date()
        const monthStart = new Date(now)
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)

        if (txStudent.lastQuotaReset < monthStart) {
          await tx.student.update({
            where: { id: txStudent.id },
            data: { monthlyMeetingsUsed: 0, lastQuotaReset: now },
          })
          txStudent.monthlyMeetingsUsed = 0
          txStudent.lastQuotaReset = now
        }

        // 检查是否超过月度配额限制
        const policy = await tx.servicePolicy.findUnique({
          where: { level: txStudent.serviceLevel },
        })
        if (txStudent.serviceLevel !== 'level2') {
          let monthlyLimit = 10
          if (policy) monthlyLimit = policy.monthlyAutoApprove
          if (txStudent.monthlyMeetingsUsed >= monthlyLimit) {
            const e: any = new Error('QUOTA_EXCEEDED_TX')
            e.code = 'QUOTA_EXCEEDED_TX'
            throw e
          }
        }

        // 根据服务级别决定是否需要审批
        let approvalRequired = true
        let status: 'pending' | 'approved' = 'pending'
        if (txStudent.serviceLevel === 'premium') {
          approvalRequired = false
          status = 'approved'
        } else if (txStudent.serviceLevel === 'level1') {
          const policyLevel1 = await tx.servicePolicy.findUnique({ where: { level: 'level1' } })
          const autoApproveLimit = policyLevel1?.monthlyAutoApprove || 2
          if (txStudent.monthlyMeetingsUsed < autoApproveLimit) {
            approvalRequired = false
            status = 'approved'
          }
        }

        // 在事务内创建预约
        const created = await tx.appointment.create({
          data: {
            studentId: validatedData.studentId,
            teacherId: validatedData.teacherId,
            subjectId: subject.id,
            scheduledTime,
            durationMinutes: validatedData.durationMinutes,
            status,
            approvalRequired,
            approvedAt: status === 'approved' ? new Date() : null,
            idempotencyKey: validatedData.idempotencyKey,
          },
        })

        // 更新学生月度使用次数（事务内）
        await tx.student.update({
          where: { id: txStudent.id },
          data: { monthlyMeetingsUsed: { increment: 1 } },
        })

        return created
      })
    } catch (err: any) {
      // 事务内部产生的特定错误映射为友好 HTTP 响应
      if (err?.code === 'SLOT_TAKEN_TX') {
        return fail('该时间已被其他学生预订，请重新选择时间进行预约', 409, 'SLOT_TAKEN')
      }
      if (err?.code === 'MAX_DAILY_REACHED_TX') {
        return fail('Teacher has reached maximum daily appointments', 409, 'MAX_DAILY_REACHED')
      }
      if (err?.code === 'QUOTA_EXCEEDED_TX') {
        return fail('Monthly appointment quota exceeded', 409, 'QUOTA_EXCEEDED')
      }
      // Prisma 唯一约束错误代码 P2002
      if (err?.code === 'P2002') {
        return fail('该时间已被其他学生预订，请重新选择时间进行预约', 409, 'SLOT_TAKEN')
      }

      throw err
    }

    const existingStudentSubject = await prisma.studentSubject.findUnique({
      where: { studentId_subjectId: { studentId: validatedData.studentId, subjectId: subject.id } },
    })
    if (!existingStudentSubject) {
      await prisma.studentSubject.create({
        data: { studentId: validatedData.studentId, subjectId: subject.id },
      })
    }

    // 确保教师有该科目
    const existingTeacherSubject = await prisma.teacherSubject.findUnique({
      where: { teacherId_subjectId: { teacherId: validatedData.teacherId, subjectId: subject.id } },
    })
    if (!existingTeacherSubject) {
      await prisma.teacherSubject.create({
        data: { teacherId: validatedData.teacherId, subjectId: subject.id },
      })
    }

    // 清除相关缓存
    const dateStr = scheduledTime.toISOString().split('T')[0]
    await deleteCachePattern(`slots:${validatedData.teacherId}:${dateStr}:*`)

    // 发送邮件通知
    try {
      // 获取科目名称
      const subjectRecord = await prisma.subject.findUnique({
        where: { id: subject.id },
      })

      if (subjectRecord) {
        // 受控发送邮件：在 serverless 环境中 setTimeout 可能不会被执行，
        // 我们根据环境变量决定是同步等待发送还是 fire-and-forget。
        const _sendAppointmentNotifications = async () => {
          try {
            const aptStatus = appointment?.status
            if (aptStatus === 'pending') {
              const res = await sendNewAppointmentRequestNotification(teacher.user.email, {
                studentName: student.user.name,
                subject: subject.name,
                scheduledTime: scheduledTime.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: (teacher as any)?.timezone || 'UTC',
                }),
                durationMinutes: validatedData.durationMinutes,
                studentEmail: student.user.email,
              })
              return { teacherSent: res?.teacherSent }
            } else if (aptStatus === 'approved') {
              const res = await sendAppointmentApprovedNotification(
                student.user.email,
                teacher.user.email,
                {
                  studentName: student.user.name,
                  teacherName: teacher.user.name,
                  subject: subject.name,
                  scheduledTime: scheduledTime.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: (teacher as any)?.timezone || 'UTC',
                  }),
                  durationMinutes: validatedData.durationMinutes,
                }
              )
              return { studentSent: res?.studentSent, teacherSent: res?.teacherSent }
            }
          } catch (error) {
            logger.error('appointment.notify.create.failed', { error: String(error) })
            return { error: String(error) }
          }
          return {}
        }

        let emailDebug: any = undefined
        if (process.env.SEND_EMAIL_SYNC === 'true') {
          // 在某些部署（或测试）中希望确保邮件已发送再返回
          // 修改 _sendAppointmentNotifications 以返回 studentSent/teacherSent
          try {
            const result = await _sendAppointmentNotifications()
            emailDebug = result
          } catch (e) {
            logger.error('appointment.notify.create.sync_failed', { error: String(e) })
            emailDebug = { error: String(e) }
          }
        } else {
          // fire-and-forget：启动发送但不阻塞响应（比 setTimeout 更可靠）
          _sendAppointmentNotifications().catch((err) =>
            logger.error('appointment.notify.create.async_failed', { error: String(err) })
          )
        }
      }
    } catch (error) {
      logger.error('appointment.notify.create.prepare_failed', { error: String(error) })
    }

    const responseBody: any = {
      id: appointment.id,
      status: appointment.status,
      approvalRequired: appointment.approvalRequired,
    }
    if (emailDebug) responseBody.emailDebug = emailDebug

    return ok(responseBody, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid input data', 400, 'BAD_REQUEST', error.errors)
    }

    logger.error('appointments.create.exception', {
      ...getRequestMeta(request),
      error: String(error),
    })

    // 返回更详细的错误信息
    let errorMessage = 'Failed to create appointment'
    if (error instanceof Error) {
      errorMessage = error.message
    }

    return fail(errorMessage, 500, 'INTERNAL_ERROR')
  }
}

export const GET = withRoles(['student', 'teacher'])(getAppointmentsHandler)
export const POST = withRateLimit({ windowMs: 60 * 1000, max: 30 })(
  withRole('student')(createAppointmentHandler)
)
