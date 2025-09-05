type Level = 'debug' | 'info' | 'warn' | 'error'

function base(meta?: Record<string, any>) {
  const ts = new Date().toISOString()
  return { ts, service: 'edu-scheduler', ...meta }
}

export function getRequestMeta(req?: Request | { headers?: Headers | any; method?: string; url?: string }) {
  try {
    const headers: Headers | undefined = (req as any)?.headers
    const url = (req as any)?.url
    const method = (req as any)?.method
    const origin = headers?.get?.('origin') || undefined
    const ua = headers?.get?.('user-agent') || undefined
    const xff = headers?.get?.('x-forwarded-for') || undefined
    const reqId = headers?.get?.('x-request-id') || undefined
    return { method, url, origin, ua, xff, requestId: reqId }
  } catch {
    return {}
  }
}

function log(level: Level, msg: string, meta?: Record<string, any>) {
  const payload = { level, msg, ...base(meta) }
  // Structured log line
  const line = JSON.stringify(payload)
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line)
      break
    case 'info':
      // eslint-disable-next-line no-console
      console.log(line)
      break
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line)
      break
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line)
      break
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log('error', msg, meta),
}

