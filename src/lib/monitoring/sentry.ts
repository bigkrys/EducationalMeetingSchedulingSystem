import * as Sentry from '@sentry/nextjs'

type RouteHandler<TCtx = any> = (request: Request, context: TCtx) => Promise<Response> | Response

export function captureException(err: unknown, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([k, v]) => scope.setTag(k, String(v)))
    }
    Sentry.captureException(err)
  })
}

export function withSentryRoute<TCtx = any>(handler: RouteHandler<TCtx>, name?: string) {
  return async (request: Request, context: TCtx) => {
    try {
      const url = new URL(request.url)
      const txnName = name || `${request.method} ${url.pathname}`
      return await Sentry.startSpan({ name: txnName, op: 'http.server' }, async () => {
        return await handler(request, context)
      })
    } catch (err) {
      captureException(err, { where: name || 'route' })
      // 在 Serverless 场景尽量快速 flush，减少事件丢失
      try {
        await Sentry.flush(2000)
      } catch {}
      throw err // 继续抛出以保持原有语义
    }
  }
}

export const metrics = Sentry.metrics

export function span<T>(name: string, fn: () => Promise<T> | T, op = 'task') {
  return Sentry.startSpan({ name, op }, fn)
}
