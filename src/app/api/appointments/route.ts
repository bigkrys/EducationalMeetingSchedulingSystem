import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { createAppointmentSchema, appointmentsQuerySchema } from '@/lib/api/validation'
import { withRole, withRoles } from '@/lib/api/middleware'
import { deleteCachePattern } from '@/lib/api/cache'
import { z } from 'zod'
import { addMinutes, isBefore, isAfter } from 'date-fns'
import { sendNewAppointmentRequestNotification, sendAppointmentApprovedNotification } from '@/lib/api/email'

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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20
    }

    // 验证必需参数
    if (!queryData.role) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Role is required' },
        { status: 400 }
      )
    }

    if (queryData.role === 'student' && !queryData.studentId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'StudentId is required for student role' },
        { status: 400 }
      )
    }

    if (queryData.role === 'teacher' && !queryData.teacherId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'TeacherId is required for teacher role' },
        { status: 400 }
      )
    }

    // 验证UUID格式（如果提供了的话）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    
    if (queryData.studentId && !uuidRegex.test(queryData.studentId)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid studentId format' },
        { status: 400 }
      )
    }

    if (queryData.teacherId && !uuidRegex.test(queryData.teacherId)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid teacherId format' },
        { status: 400 }
      )
    }

    // 构建查询条件
    const where: Record<string, any> = {}
    
    if (queryData.role === 'student' && queryData.studentId) {
      // 如果是学生角色，需要根据User ID查找对应的Student ID
      const student = await prisma.student.findUnique({
        where: { userId: queryData.studentId }
      })
      
      if (!student) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'Student not found for this user' },
          { status: 400 }
        )
      }
      
      where.studentId = student.id
    } else if (queryData.role === 'teacher' && queryData.teacherId) {
      // 如果是教师角色，需要根据User ID查找对应的Teacher ID
      const teacher = await prisma.teacher.findUnique({
        where: { userId: queryData.teacherId }
      })
      
      if (!teacher) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'Teacher not found for this user' },
          { status: 400 }
        )
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
        where: { id: queryData.cursor }
      })
      
      if (cursorAppointment) {
        where.scheduledTime = {
          gt: cursorAppointment.scheduledTime
        }
      }
    }

    // 查询预约
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        student: { include: { user: true } },
        teacher: { include: { user: true } },
        subject: true
      },
      orderBy: { scheduledTime: 'asc' },
      take: take + 1, // 多取一个来判断是否有下一页
      skip
    })
    // 判断是否有下一页
    const hasNext = appointments.length > take
    const items = appointments.slice(0, take)
    const nextCursor = hasNext ? items[items.length - 1]?.id : null

    return NextResponse.json({
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
          serviceLevel: apt.student.serviceLevel
        },
        teacher: {
          id: apt.teacher.id,
          name: apt.teacher.user.name
        }
      })),
      nextCursor
    })

  } catch (error) {
    console.error('Get appointments error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to fetch appointments' },
      { status: 500 }
    )
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
      where: { idempotencyKey: validatedData.idempotencyKey }
    })

    if (existingAppointment) {
      return NextResponse.json(
        { error: 'IDEMPOTENT_CONFLICT', message: 'Appointment with this idempotency key already exists' },
        { status: 409 }
      )
    }

    // 检查学生是否存在且为激活状态
    const student = await prisma.student.findUnique({
      where: { id: validatedData.studentId },
      include: { user: true }
    })

    if (!student || student.user.status !== 'active') {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Student not found or inactive' },
        { status: 400 }
      )
    }

    // 检查教师是否存在
    const teacher = await prisma.teacher.findUnique({
      where: { id: validatedData.teacherId },
      include: { user: true }
    })

    if (!teacher || teacher.user.status !== 'active') {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Teacher not found or inactive' },
        { status: 400 }
      )
    }

    // 检查科目是否匹配
    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: validatedData.teacherId,
        subject: {
          name: validatedData.subject
        }
      }
    })

    if (!teacherSubject) {
      return NextResponse.json(
        { error: 'SUBJECT_MISMATCH', message: 'Teacher does not teach this subject' },
        { status: 400 }
      )
    }

    // 检查学生是否已注册该科目
    const studentSubject = await prisma.studentSubject.findFirst({
      where: {
        studentId: validatedData.studentId,
        subject: {
          name: validatedData.subject
        }
      }
    })

    if (!studentSubject) {
      return NextResponse.json(
        { error: 'SUBJECT_MISMATCH', message: 'Student is not enrolled in this subject' },
        { status: 400 }
      )
    }

  // 检查槽位是否可用
  // 标准化 scheduledTime 到分钟精度，避免微秒/秒差异导致并发时写入不同的 timestamp
  const scheduledTime = new Date(validatedData.scheduledTime)
  scheduledTime.setSeconds(0, 0)
    const slotEnd = addMinutes(scheduledTime, validatedData.durationMinutes)
    
    // 检查是否与已有预约冲突（包含缓冲时间）
    const bufferStart = addMinutes(scheduledTime, -teacher.bufferMinutes)
    const bufferEnd = addMinutes(slotEnd, teacher.bufferMinutes)
    
    const conflictingAppointments = await prisma.appointment.findMany({
      where: {
        teacherId: validatedData.teacherId,
        scheduledTime: { lt: bufferEnd },
        status: { in: ['pending', 'approved'] }
      }
    })

    const hasConflict = conflictingAppointments.some((appointment: any) => {
      const appointmentEnd = addMinutes(appointment.scheduledTime, appointment.durationMinutes)
      return (bufferStart < appointmentEnd && bufferEnd > appointment.scheduledTime)
    })

    if (hasConflict) {
      return NextResponse.json(
  { error: 'SLOT_TAKEN', message: '该时间已被其他学生预订，请重新选择时间进行预约' },
        { status: 409 }
      )
    }

    // 检查教师当日预约数量限制
    const dayStart = new Date(scheduledTime)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(scheduledTime)
    dayEnd.setHours(23, 59, 59, 999)

    const dailyAppointments = await prisma.appointment.count({
      where: {
        teacherId: validatedData.teacherId,
        scheduledTime: { gte: dayStart, lte: dayEnd },
        status: { in: ['pending', 'approved'] }
      }
    })

    if (dailyAppointments >= teacher.maxDailyMeetings) {
      return NextResponse.json(
        { error: 'MAX_DAILY_REACHED', message: 'Teacher has reached maximum daily appointments' },
        { status: 409 }
      )
    }

    // 检查学生月度配额
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
      // 重新获取学生信息
      const updatedStudent = await prisma.student.findUnique({
        where: { id: student.id }
      })
      if (updatedStudent) {
        student.monthlyMeetingsUsed = updatedStudent.monthlyMeetingsUsed
      }
    }

    // 检查是否超过月度配额限制
    const policy = await prisma.servicePolicy.findUnique({
      where: { level: student.serviceLevel }
    })
    
    // 对于level2学生，允许创建预约但状态为pending
    // 对于其他级别，检查自动批准配额
    if (student.serviceLevel !== 'level2') {
      let monthlyLimit = 10 // 默认限制
      if (policy) {
        monthlyLimit = policy.monthlyAutoApprove // 使用数据库策略配置
      }

      if (student.monthlyMeetingsUsed >= monthlyLimit) {
        return NextResponse.json(
          { error: 'QUOTA_EXCEEDED', message: 'Monthly appointment quota exceeded' },
          { status: 409 }
        )
      }
    }

    // 根据服务级别决定是否需要审批
    let approvalRequired = true
    let status: 'pending' | 'approved' = 'pending'

    if (student.serviceLevel === 'premium') {
      approvalRequired = false
      status = 'approved'
    } else if (student.serviceLevel === 'level1') {
      // 检查是否还有自动批准次数
      const policy = await prisma.servicePolicy.findUnique({
        where: { level: 'level1' }
      })
      
      const autoApproveLimit = policy?.monthlyAutoApprove || 2
      if (student.monthlyMeetingsUsed < autoApproveLimit) {
        approvalRequired = false
        status = 'approved'
      }
    }

    // 首先查找或创建科目
    let subject = await prisma.subject.findFirst({
      where: { name: validatedData.subject }
    })
    
    if (!subject) {
      // 如果科目不存在，创建一个新的
      subject = await prisma.subject.create({
        data: {
          name: validatedData.subject,
          code: validatedData.subject.toUpperCase().replace(/\s+/g, '_'),
          description: `科目：${validatedData.subject}`
        }
      })
    }

    // 确保学生有该科目
    const existingStudentSubject = await prisma.studentSubject.findUnique({
      where: {
        studentId_subjectId: {
          studentId: validatedData.studentId,
          subjectId: subject.id
        }
      }
    })

    if (!existingStudentSubject) {
      await prisma.studentSubject.create({
        data: {
          studentId: validatedData.studentId,
          subjectId: subject.id
        }
      })
    }

    // 确保教师有该科目
    const existingTeacherSubject = await prisma.teacherSubject.findUnique({
      where: {
        teacherId_subjectId: {
          teacherId: validatedData.teacherId,
          subjectId: subject.id
        }
      }
    })

    if (!existingTeacherSubject) {
      await prisma.teacherSubject.create({
        data: {
          teacherId: validatedData.teacherId,
          subjectId: subject.id
        }
      })
    }

    // 创建预约（注意并发可能导致竞态）。如果数据库存在唯一约束冲突，则返回 SLOT_TAKEN。
    let appointment: any
    try {
      appointment = await prisma.appointment.create({
        data: {
          studentId: validatedData.studentId,
          teacherId: validatedData.teacherId,
          subjectId: subject.id,
          scheduledTime,
          durationMinutes: validatedData.durationMinutes,
          status,
          approvalRequired,
          approvedAt: status === 'approved' ? new Date() : null,
          idempotencyKey: validatedData.idempotencyKey
        }
      })
    } catch (err: any) {
      // Prisma 唯一约束错误代码 P2002
      if (err?.code === 'P2002') {
        return NextResponse.json(
          { error: 'SLOT_TAKEN', message: '该时间已被其他学生预订，请重新选择时间进行预约' },
          { status: 409 }
        )
      }

      throw err
    }


    // 更新学生月度使用次数
    await prisma.student.update({
      where: { id: student.id },
      data: { monthlyMeetingsUsed: { increment: 1 } }
    })

    // 清除相关缓存
    const dateStr = scheduledTime.toISOString().split('T')[0]
    await deleteCachePattern(`slots:${validatedData.teacherId}:${dateStr}:*`)

    // 发送邮件通知
    try {
      // 获取科目名称
      const subjectRecord = await prisma.subject.findUnique({
        where: { id: subject.id }
      })

      if (subjectRecord) {
        // 受控发送邮件：在 serverless 环境中 setTimeout 可能不会被执行，
        // 我们根据环境变量决定是同步等待发送还是 fire-and-forget。
        const _sendAppointmentNotifications = async () => {
          try {
            if (status === 'pending') {
              const res = await sendNewAppointmentRequestNotification(
                teacher.user.email,
                {
                  studentName: student.user.name,
                  subject: subject.name,
                  scheduledTime: scheduledTime.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Shanghai'
                  }),
                  durationMinutes: validatedData.durationMinutes,
                  studentEmail: student.user.email
                }
              )
              return { teacherSent: res?.teacherSent }
            } else if (status === 'approved') {
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
                    timeZone: 'Asia/Shanghai'
                  }),
                  durationMinutes: validatedData.durationMinutes
                }
              )
              return { studentSent: res?.studentSent, teacherSent: res?.teacherSent }
            }
          } catch (error) {
            console.error('Failed to send appointment notification emails:', error)
            return { error: String(error) }
          }
          return { }
        }

        let emailDebug: any = undefined
        if (process.env.SEND_EMAIL_SYNC === 'true') {
          // 在某些部署（或测试）中希望确保邮件已发送再返回
          // 修改 _sendAppointmentNotifications 以返回 studentSent/teacherSent
          try {
            const result = await _sendAppointmentNotifications()
            emailDebug = result
          } catch (e) {
            console.error('Sync email send error:', e)
            emailDebug = { error: String(e) }
          }
        } else {
          // fire-and-forget：启动发送但不阻塞响应（比 setTimeout 更可靠）
          _sendAppointmentNotifications().catch(err => console.error('Async email send error:', err))
        }
      }
    } catch (error) {
      console.error('Failed to prepare appointment notification emails:', error)
    }

    const responseBody: any = {
      id: appointment.id,
      status: appointment.status,
      approvalRequired: appointment.approvalRequired
    }
    if (emailDebug) responseBody.emailDebug = emailDebug

    return NextResponse.json(responseBody, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid input data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Create appointment error:', error)
    
    // 返回更详细的错误信息
    let errorMessage = 'Failed to create appointment'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    
    return NextResponse.json(
      { 
        error: 'BAD_REQUEST', 
        message: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export const GET = withRoles(['student', 'teacher'])(getAppointmentsHandler)
export const POST = withRole('student')(createAppointmentHandler)