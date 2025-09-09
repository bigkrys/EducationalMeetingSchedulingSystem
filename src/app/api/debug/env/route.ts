import { NextResponse } from 'next/server'

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
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || null,

    // Node 环境
    NODE_ENV: process.env.NODE_ENV || null,

    // 时间戳
    timestamp: new Date().toISOString(),

    // 计算的 Sentry 环境
    computed_sentry_env: computeSentryEnvironment(),
  }

  return NextResponse.json(envDebug, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

function computeSentryEnvironment(): string {
  // 使用与实际 Sentry 配置相同的逻辑
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT
  }

  if (process.env.VERCEL_ENV) {
    switch (process.env.VERCEL_ENV) {
      case 'production':
        return 'production'
      case 'preview':
        return 'preview'
      case 'development':
        return 'development'
      default:
        return process.env.VERCEL_ENV
    }
  }

  return process.env.NODE_ENV || 'development'
}
