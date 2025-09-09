'use client'
import * as Sentry from '@sentry/nextjs'
import { getSentryEnvironment } from '@/lib/monitoring/environment'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
const environment = getSentryEnvironment()

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
