import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE || (environment === 'development' ? 0.2 : 0.05)
    ),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || 0),
    beforeSend(event) {
      // 服务器端字段清理
      if (event?.request?.headers) {
        delete (event.request.headers as any)['authorization']
        delete (event.request.headers as any)['cookie']
      }
      return event
    },
  })
}

export { Sentry }
