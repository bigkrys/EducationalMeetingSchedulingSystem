import * as Sentry from '@sentry/node'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs' // 指定使用 Node.js 运行时（而非 Edge）

let sentryInited = false
function initSentry() {
  if (sentryInited) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return // 未配置 DSN 时直接跳过初始化
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  })
  sentryInited = true
}

export async function GET() {
  initSentry()

  // 构造一个带若干 span 的模拟事务，便于在 Performance 面板看到
  const hasClient = Boolean(Sentry.getCurrentHub().getClient())
  if (hasClient) {
    await Sentry.startSpan({ name: 'debug endpoint', op: 'http.server' }, async () => {
      await Sentry.startSpan({ name: 'simulate db', op: 'db.query' }, async () => {
        await new Promise((r) => setTimeout(r, 120))
      })
      await Sentry.startSpan({ name: 'simulate external http', op: 'http.client' }, async () => {
        await new Promise((r) => setTimeout(r, 80))
      })
      Sentry.captureMessage(`sentry debug ping: ${Date.now()}`, {
        level: 'info',
        tags: { source: 'debug-route' },
      })
    })
    await Sentry.flush(2000)
  }

  return NextResponse.json({
    ok: true,
    environment: process.env.SENTRY_ENVIRONMENT || null,
    sent: hasClient,
  })
}
