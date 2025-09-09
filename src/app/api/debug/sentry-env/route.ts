import { NextResponse } from 'next/server'
import { getSentryEnvironment } from '@/lib/monitoring/environment'

export const runtime = 'nodejs'

export async function GET() {
  // 收集所有相关的环境变量用于调试
  const envDebug = {
    // Sentry 相关
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || null,
    SENTRY_DSN: process.env.SENTRY_DSN ? 'configured' : null,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ? 'configured' : null,

    // Vercel 相关
    VERCEL_ENV: process.env.VERCEL_ENV || null,
    VERCEL_URL: process.env.VERCEL_URL || null,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || null,

    // Node 环境
    NODE_ENV: process.env.NODE_ENV || null,

    // 时间戳
    timestamp: new Date().toISOString(),

    // 计算的 Sentry 环境
    computed_sentry_env: getSentryEnvironment(),

    // 原始逻辑对比
    old_logic: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  }

  return NextResponse.json(envDebug, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
