'use client'
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

// 客户端环境判断 - 只能访问 NEXT_PUBLIC_ 开头的环境变量
function getClientSentryEnvironment(): string {
  // 如果明确设置了客户端环境变量
  if (process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) {
    return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
  }

  // 在 Vercel 环境中，使用 NEXT_PUBLIC_VERCEL_ENV
  if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
      case 'production':
        return 'production'
      case 'preview':
        return 'preview'
      case 'development':
        return 'development'
      default:
        return process.env.NEXT_PUBLIC_VERCEL_ENV
    }
  }

  // 回退到 NODE_ENV
  return process.env.NODE_ENV || 'development'
}

const environment = getClientSentryEnvironment()

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE || (environment === 'development' ? 0.2 : 0.05)
    ),
    integrations: [
      // 保护性判断：若意外在非浏览器环境执行，避免调用不存在的集成
      typeof (Sentry as any).browserTracingIntegration === 'function'
        ? (Sentry as any).browserTracingIntegration()
        : undefined,
    ].filter(Boolean) as any,
    // 客户端默认不发送 PII（个人敏感信息）
    sendDefaultPii: false,
    beforeSend(event) {
      if (event?.request?.headers) {
        // 清理常见敏感请求头
        delete (event.request.headers as any)['authorization']
        delete (event.request.headers as any)['cookie']
      }
      return event
    },
  })
}
