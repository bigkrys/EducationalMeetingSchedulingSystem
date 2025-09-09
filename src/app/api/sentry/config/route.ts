import { NextResponse } from 'next/server'
import { withSentryRoute } from '@/lib/monitoring/sentry'

export const runtime = 'nodejs'

async function getHandler() {
  // 暴露最少且非敏感的客户端初始化配置
  // 说明：Sentry DSN 不是密钥（仅用于上报），公开无安全风险
  const dsn = process.env.SENTRY_DSN || ''
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
  // 如后续启用 DSN tunnel，也可在此一并返回
  const tunnel = undefined as string | undefined

  return NextResponse.json({ dsn, environment, tunnel })
}

export const GET = withSentryRoute(getHandler as any, 'api GET /api/sentry/config')
