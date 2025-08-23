import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole } from '@/lib/api/middleware'

async function getAuditLogsHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const actor = searchParams.get('actor')
    const action = searchParams.get('action')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // 构建查询条件
    const where: any = {}
    
    if (actor) {
      where.actor = { name: { contains: actor, mode: 'insensitive' } }
    }
    
    if (action) {
      where.action = action
    }
    
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) where.createdAt.lte = new Date(to)
    }

    // 获取审计日志总数
    const total = await prisma.auditLog.count({ where })

    // 获取审计日志列表
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    })

    // 格式化日志数据
    const formattedLogs = logs.map(log => ({
      id: log.id,
      actor: log.actor?.name || 'System',
      action: log.action,
      target: log.targetId || 'N/A',
      details: log.details || '',
      ipAddress: log.ipAddress || 'N/A',
      userAgent: log.userAgent || 'N/A',
      timestamp: log.createdAt.toISOString()
    }))

    return NextResponse.json({
      logs: formattedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })

  } catch (error) {
    console.error('Get audit logs error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}

export const GET = withRole('admin')(getAuditLogsHandler)
