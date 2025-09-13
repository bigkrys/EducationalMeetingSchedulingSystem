import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRoles } from '@/lib/api/middleware'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'
import { withSentryRoute } from '@/lib/monitoring/sentry'

// 获取所有服务策略
async function getPoliciesHandler(request: NextRequest, context?: any) {
  try {
    // 如果策略表为空，初始化默认策略
    let policies = await prisma.servicePolicy.findMany({ orderBy: { level: 'asc' } })
    if (!policies || policies.length === 0) {
      const defaults = [
        {
          level: 'level1',
          monthlyAutoApprove: 2,
          priority: false,
          expireHours: 48,
          reminderOffsets: '24,1',
        },
        {
          level: 'level2',
          monthlyAutoApprove: 0,
          priority: false,
          expireHours: 48,
          reminderOffsets: '24,1',
        },
        {
          level: 'premium',
          monthlyAutoApprove: 10000,
          priority: true,
          expireHours: 48,
          reminderOffsets: '24,1',
        },
      ]
      for (const p of defaults) {
        // upsert 以避免并发初始化问题
        await prisma.servicePolicy.upsert({
          where: { level: p.level },
          update: p,
          create: p,
        })
      }
      policies = await prisma.servicePolicy.findMany({ orderBy: { level: 'asc' } })
    }

    return ok({
      policies: policies.map((policy) => ({
        level: policy.level,
        monthlyAutoApprove: policy.monthlyAutoApprove,
        priority: policy.priority,
        expireHours: policy.expireHours,
        reminderOffsets: policy.reminderOffsets,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('policies.get.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch policies', 500, E.INTERNAL_ERROR)
  }
}

// 更新服务策略
async function updatePoliciesHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { policies } = body

    if (!policies || !Array.isArray(policies)) {
      return fail('policies array is required', 400, E.BAD_REQUEST)
    }

    // 验证策略数据
    const validLevels = ['level1', 'level2', 'premium']
    for (const policy of policies) {
      if (!validLevels.includes(policy.level)) {
        return fail(`Invalid level: ${policy.level}`, 400, E.POLICY_INVALID_LEVEL)
      }

      if (typeof policy.monthlyAutoApprove !== 'number' || policy.monthlyAutoApprove < 0) {
        return fail(
          'monthlyAutoApprove must be a non-negative number',
          400,
          E.POLICY_INVALID_MONTHLY_AUTO_APPROVE
        )
      }

      if (typeof policy.expireHours !== 'number' || policy.expireHours < 1) {
        return fail('expireHours must be at least 1', 400, E.POLICY_INVALID_EXPIRE_HOURS)
      }
    }

    // 批量更新策略
    const updatePromises = policies.map(async (policy) => {
      return await prisma.servicePolicy.upsert({
        where: { level: policy.level },
        update: {
          monthlyAutoApprove: policy.monthlyAutoApprove,
          priority: policy.priority || false,
          expireHours: policy.expireHours,
          reminderOffsets: policy.reminderOffsets || '24,1',
        },
        create: {
          level: policy.level,
          monthlyAutoApprove: policy.monthlyAutoApprove,
          priority: policy.priority || false,
          expireHours: policy.expireHours,
          reminderOffsets: policy.reminderOffsets || '24,1',
        },
      })
    })

    const updatedPolicies = await Promise.all(updatePromises)

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'POLICIES_UPDATED',
        details: JSON.stringify({
          updatedPolicies: policies.map((p) => ({
            level: p.level,
            monthlyAutoApprove: p.monthlyAutoApprove,
            priority: p.priority,
            expireHours: p.expireHours,
            reminderOffsets: p.reminderOffsets,
          })),
          updatedAt: new Date().toISOString(),
        }),
      },
    })

    return ok({
      message: 'Policies updated successfully',
      updated: updatedPolicies.length,
      policies: updatedPolicies.map((policy) => ({
        level: policy.level,
        monthlyAutoApprove: policy.monthlyAutoApprove,
        priority: policy.priority,
        expireHours: policy.expireHours,
        reminderOffsets: policy.reminderOffsets,
        updatedAt: policy.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('policies.update.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to update policies', 500, E.INTERNAL_ERROR)
  }
}

export const GET = withRoles(['admin', 'superadmin'])(
  withSentryRoute(getPoliciesHandler, 'api GET /api/policies')
)
export const PUT = withRoles(['admin', 'superadmin'])(
  withSentryRoute(updatePoliciesHandler, 'api PUT /api/policies')
)
