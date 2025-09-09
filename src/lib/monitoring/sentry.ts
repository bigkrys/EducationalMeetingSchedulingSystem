import * as Sentry from '@sentry/nextjs'

export function captureException(err: unknown, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([k, v]) => scope.setTag(k, String(v)))
    }
    Sentry.captureException(err)
  })
}

// Preserve the original handler's parameter and return types
export function withSentryRoute<H extends (...args: any[]) => any>(handler: H, name?: string): H {
  const wrapped = (...args: Parameters<H>): ReturnType<H> => {
    try {
      const req: any = args[0]
      let txnName = name || 'route'
      try {
        if (req?.url && req?.method) {
          const url = new URL(req.url)
          txnName = name || `${req.method} ${url.pathname}`
        }
      } catch {}

      // Sentry.startSpan 将返回 handler 的返回值，无论是同步值还是 Promise，
      // 因此 wrapped 的返回类型与 handler 的返回类型一致。
      // We intentionally do not make this function async to preserve the original return type shape.
      return Sentry.startSpan({ name: txnName, op: 'http.server' }, () =>
        handler(...(args as any))
      ) as ReturnType<H>
    } catch (err) {
      captureException(err, { where: name || 'route' })
      // flush asynchronously, don't await to avoid changing return type
      try {
        void Sentry.flush(2000)
      } catch {}
      throw err
    }
  }

  return wrapped as unknown as H
}

export const metrics = Sentry.metrics

// 类型安全的 metrics increment 包装，用于在服务端调用 Sentry metrics
export function metricsIncrement(
  name: string,
  by = 1,
  tags?: Record<string, string | number | boolean>
) {
  try {
    const stringTags = Object.fromEntries(
      Object.entries(tags || {}).map(([k, v]) => [k, String(v)])
    ) as Record<string, string>
    Sentry.metrics.increment(name, by, { tags: stringTags })
  } catch {}
}

export function span<T>(name: string, fn: () => Promise<T> | T, op = 'task') {
  return Sentry.startSpan({ name, op }, fn)
}
