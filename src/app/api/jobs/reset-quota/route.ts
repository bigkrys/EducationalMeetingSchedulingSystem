import { NextRequest } from 'next/server'
import { prisma } from '@/lib/api/db'
import { authorizeJobRequest } from '@/lib/api/job-auth'
import { ok, fail } from '@/lib/api/response'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text().catch(() => '')
    // 统一授权检查（根据环境在内部调度器/私有调用中更严格），支持 HMAC 校验
    const authCheck = await authorizeJobRequest(request, rawBody)
    if (authCheck) return authCheck

    // 检查是否是每月1日（或者手动触发）
    const today = new Date()
    const isFirstDayOfMonth = today.getDate() === 1
    
    if (!isFirstDayOfMonth) {
      // 如果不是每月1日，检查是否有手动触发参数
      const { searchParams } = new URL(request.url)
      const force = searchParams.get('force')
      if (force !== 'true') {
        return fail('Quota reset can only be triggered on the first day of month or with force=true', 400, 'BAD_REQUEST')
      }
    }

    // 获取所有需要重置配额的学生
    const studentsToReset = await prisma.student.findMany({
      where: {
        lastQuotaReset: { lt: new Date(today.getFullYear(), today.getMonth(), 1) }
      },
      select: { id: true, monthlyMeetingsUsed: true, lastQuotaReset: true }
    })

    if (studentsToReset.length === 0) {
      return ok({ message: 'No students need quota reset', updated: 0 })
    }

    // 批量重置配额
    const updatePromises = studentsToReset.map(student => 
      prisma.student.update({
        where: { id: student.id },
        data: {
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date(today.getFullYear(), today.getMonth(), 1)
        }
      })
    )

    await Promise.all(updatePromises)

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'QUOTA_RESET',
        details: JSON.stringify({
          resetDate: today.toISOString(),
          studentsCount: studentsToReset.length,
          students: studentsToReset.map(s => ({
            id: s.id,
            previousQuota: s.monthlyMeetingsUsed,
            previousReset: s.lastQuotaReset?.toISOString()
          }))
        })
      }
    })

    return ok({
      message: 'Monthly quota reset completed successfully',
      updated: studentsToReset.length,
      resetDate: today.toISOString(),
      details: {
        totalStudents: studentsToReset.length,
        studentsWithQuota: studentsToReset.filter(s => s.monthlyMeetingsUsed > 0).length
      }
    })

  } catch (error) {
    logger.error('job.reset_quota.exception', { error: String(error) })
    return fail('Failed to reset monthly quotas', 500, 'INTERNAL_ERROR')
  }
}
