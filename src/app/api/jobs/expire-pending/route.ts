import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import { sendAppointmentExpiredNotification } from '@/lib/api/email'
import { deleteCachePattern } from '@/lib/api/cache'
import { DEFAULT_EXPIRE_HOURS } from '@/constants'
import { ok, fail } from '@/lib/api/response'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text().catch(() => '')
    // 统一授权检查（根据环境在内部调度器/私有调用中更严格）
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck

    // 计算过期阈值：优先级 -> ENV JOB_EXPIRE_HOURS > servicePolicy.level='default' or min(policy.expireHours) > DEFAULT_EXPIRE_HOURS
    let expireHours = DEFAULT_EXPIRE_HOURS

    // 1) 环境变量覆盖（如果提供且为数字）
    const envVal = process.env.JOB_EXPIRE_HOURS
    if (envVal) {
      const parsed = parseInt(envVal, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        expireHours = parsed
      }
    }

    // 2) 尝试从 servicePolicy 中读取策略值（优先查找 level='default'，如无则取所有策略的最小 expireHours）
    try {
      const defaultPolicy = await prisma.servicePolicy.findUnique({ where: { level: 'default' } })
      if (
        defaultPolicy &&
        typeof defaultPolicy.expireHours === 'number' &&
        defaultPolicy.expireHours > 0
      ) {
        expireHours = defaultPolicy.expireHours
      } else {
        const allPolicies = await prisma.servicePolicy.findMany({ select: { expireHours: true } })
        if (allPolicies && allPolicies.length > 0) {
          // 取最小值以保证更严格的过期行为（可以按需调整为最大值/平均值）
          const minExpire = Math.min(
            ...allPolicies.map((p) => p.expireHours || DEFAULT_EXPIRE_HOURS)
          )
          if (minExpire > 0) expireHours = minExpire
        }
      }
    } catch (err) {
      // 读取策略失败则回退到默认值
      console.warn('Failed to read servicePolicy for expireHours, using defaults', err)
    }

    // 计算阈值时间
    const expireTime = new Date()
    expireTime.setHours(expireTime.getHours() - expireHours)

    // 分页批处理，避免一次性加载过多记录
    const batchSize = 200
    let totalExpired = 0

    while (true) {
      const batch = await prisma.appointment.findMany({
        where: { status: 'pending', createdAt: { lt: expireTime } },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
        include: {
          student: { include: { user: true } },
          teacher: { include: { user: true } },
        },
      })

      if (!batch || batch.length === 0) break

      // 更新状态
      const ids = batch.map((b) => b.id)
      await prisma.appointment.updateMany({
        where: { id: { in: ids } },
        data: { status: 'expired' },
      })

      totalExpired += batch.length

      // 发送通知 & 写审计（并发限制）
      const concurrency = 10
      let index = 0
      const sendNext = async () => {
        if (index >= batch.length) return
        const item = batch[index++]
        try {
          const subject = await prisma.subject.findUnique({ where: { id: item.subjectId } })
          if (subject) {
            await sendAppointmentExpiredNotification(
              item.student.user.email,
              item.teacher.user.email,
              {
                studentName: item.student.user.name,
                teacherName: item.teacher.user.name,
                subject: subject.name,
                scheduledTime: item.scheduledTime.toLocaleString('zh-CN', {
                  timeZone: (item as any)?.teacher?.timezone || 'UTC',
                }),
              }
            )
          }

          await prisma.auditLog.create({
            data: {
              action: 'APPOINTMENT_EXPIRED',
              targetId: item.id,
              details: JSON.stringify({
                appointmentId: item.id,
                studentId: item.studentId,
                studentName: item.student.user.name,
                teacherId: item.teacherId,
                teacherName: item.teacher.user.name,
                scheduledTime: item.scheduledTime.toISOString(),
                expiredAt: new Date().toISOString(),
                reason: '48 hours timeout without teacher approval',
              }),
            },
          })
        } catch (error) {
          logger.error('job.expire.process_failed', {
            appointmentId: item.id,
            error: String(error),
          })
        }

        // 继续下一个
        return sendNext()
      }

      // 启动并发任务
      const workers = Array.from({ length: Math.min(concurrency, batch.length) }).map(() =>
        sendNext()
      )
      await Promise.all(workers)

      // 清除相关缓存（按教师/日期模式）
      for (const item of batch) {
        const dateStr = item.scheduledTime.toISOString().split('T')[0]
        // slots:{teacherId}:{date}:{duration}
        await deleteCachePattern(`slots:${item.teacherId}:${dateStr}`)
      }

      // 如果少于 batchSize 则结束循环
      if (batch.length < batchSize) break
    }

    if (totalExpired === 0) {
      return ok({ message: 'No pending appointments need to expire', updated: 0 })
    }

    return ok({
      message: 'Pending appointments expired successfully',
      updated: totalExpired,
      expiredAt: new Date().toISOString(),
      details: {
        totalExpired,
      },
    })
  } catch (error) {
    logger.error('job.expire.exception', { error: String(error) })
    return fail('Failed to expire pending appointments', 500, 'INTERNAL_ERROR')
  }
}
