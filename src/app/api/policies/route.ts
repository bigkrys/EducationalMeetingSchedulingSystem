import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole } from '@/lib/api/middleware'

// 获取所有服务策略
async function getPoliciesHandler(request: NextRequest, context?: any) {
  try {
    const policies = await prisma.servicePolicy.findMany({
      orderBy: { level: 'asc' }
    })

    return NextResponse.json({
      policies: policies.map(policy => ({
        level: policy.level,
        monthlyAutoApprove: policy.monthlyAutoApprove,
        priority: policy.priority,
        expireHours: policy.expireHours,
        reminderOffsets: policy.reminderOffsets,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('Get policies error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch policies' },
      { status: 500 }
    )
  }
}

// 更新服务策略
async function updatePoliciesHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { policies } = body

    if (!policies || !Array.isArray(policies)) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'policies array is required' },
        { status: 400 }
      )
    }

    // 验证策略数据
    const validLevels = ['level1', 'level2', 'premium']
    for (const policy of policies) {
      if (!validLevels.includes(policy.level)) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: `Invalid level: ${policy.level}` },
          { status: 400 }
        )
      }

      if (typeof policy.monthlyAutoApprove !== 'number' || policy.monthlyAutoApprove < 0) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'monthlyAutoApprove must be a non-negative number' },
          { status: 400 }
        )
      }

      if (typeof policy.expireHours !== 'number' || policy.expireHours < 1) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'expireHours must be at least 1' },
          { status: 400 }
        )
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
          reminderOffsets: policy.reminderOffsets || '24,1'
        },
        create: {
          level: policy.level,
          monthlyAutoApprove: policy.monthlyAutoApprove,
          priority: policy.priority || false,
          expireHours: policy.expireHours,
          reminderOffsets: policy.reminderOffsets || '24,1'
        }
      })
    })

    const updatedPolicies = await Promise.all(updatePromises)

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'POLICIES_UPDATED',
        details: JSON.stringify({
          updatedPolicies: policies.map(p => ({
            level: p.level,
            monthlyAutoApprove: p.monthlyAutoApprove,
            priority: p.priority,
            expireHours: p.expireHours,
            reminderOffsets: p.reminderOffsets
          })),
          updatedAt: new Date().toISOString()
        })
      }
    })

    return NextResponse.json({
      message: 'Policies updated successfully',
      updated: updatedPolicies.length,
      policies: updatedPolicies.map(policy => ({
        level: policy.level,
        monthlyAutoApprove: policy.monthlyAutoApprove,
        priority: policy.priority,
        expireHours: policy.expireHours,
        reminderOffsets: policy.reminderOffsets,
        updatedAt: policy.updatedAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('Update policies error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to update policies' },
      { status: 500 }
    )
  }
}

export const GET = withRole('admin')(getPoliciesHandler)
export const PUT = withRole('admin')(updatePoliciesHandler)
