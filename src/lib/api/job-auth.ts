import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * 授权检查：
 * - 首先验证 x-job-secret 或 Authorization: Bearer <secret> 与 env 中的 JOB_TRIGGER_SECRET 匹配
 * - 在非 production 环境下，匹配 secret 即可通过（便于本地调试）
 * - 在 production 环境下，除了 secret 外还要求满足额外条件之一：
 *    - 请求来源 IP 在 JOB_ALLOWED_IPS 白名单中，或
 *    - 请求包含调度器专用 header（JOB_SCHEDULER_HEADER_NAME/JOB_SCHEDULER_HEADER_VALUE）
 *
 * 返回值：若通过返回 null；若不通过返回一个 NextResponse（401）以便路由直接 return
 */
export async function authorizeJobRequest(
  request: NextRequest,
  rawBody?: string
): Promise<NextResponse | null> {
  const headerSecret = request.headers.get('x-job-secret') || ''
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const triggerSecret = process.env.JOB_TRIGGER_SECRET || ''

  if (!triggerSecret) {
    // 如果未配置 secret：开发时允许，生产环境拒绝
    if (process.env.NODE_ENV !== 'production') return null
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Missing job trigger secret in server env' },
      { status: 401 }
    )
  }

  if (headerSecret === triggerSecret || bearer === triggerSecret) {
    // 如果启用了 HMAC 要求，优先在此做校验（可通过 env 打开）
    const requireHmac = (process.env.JOB_REQUIRE_HMAC || 'false').toLowerCase() === 'true'

    const tsHeader = request.headers.get('x-job-ts') || ''
    const sigHeader = request.headers.get('x-job-signature') || ''

    // 如果配置要求 HMAC 或请求提供了签名头，则验证签名
    if (requireHmac || (tsHeader && sigHeader)) {
      if (!tsHeader || !sigHeader) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Missing HMAC headers' },
          { status: 401 }
        )
      }

      const windowSec = parseInt(process.env.JOB_HMAC_WINDOW_SECONDS || '300', 10)
      const ts = parseInt(tsHeader, 10)
      if (Number.isNaN(ts))
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Invalid timestamp' },
          { status: 401 }
        )
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - ts) > windowSec) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Timestamp outside allowed window' },
          { status: 401 }
        )
      }

      // 构造要签名的字符串：ts + method + path + body（body 可能为空）
      let path = ''
      try {
        path = new URL(request.url).pathname
      } catch (e) {
        path = request.nextUrl?.pathname || ''
      }
      const payload = `${ts}.${request.method}.${path}.${rawBody || ''}`
      const h = crypto.createHmac('sha256', triggerSecret).update(payload).digest('base64')

      try {
        const sigBuf = Buffer.from(sigHeader, 'base64')
        const hBuf = Buffer.from(h, 'base64')
        if (sigBuf.length !== hBuf.length || !crypto.timingSafeEqual(sigBuf, hBuf)) {
          return NextResponse.json(
            { error: 'UNAUTHORIZED', message: 'Invalid signature' },
            { status: 401 }
          )
        }
      } catch (e) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Invalid signature format' },
          { status: 401 }
        )
      }
    }

    // 开发环境：仅需 secret（或签名通过）
    if (process.env.NODE_ENV !== 'production') return null

    // 生产环境：需要额外的网络/调度器约束
    const allowedIps = (process.env.JOB_ALLOWED_IPS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const xfwd = request.headers.get('x-forwarded-for') || ''
    const remoteIp = xfwd.split(',')[0].trim() || ''
    if (allowedIps.length > 0 && remoteIp && allowedIps.includes(remoteIp)) {
      return null
    }

    const headerName = process.env.JOB_SCHEDULER_HEADER_NAME || ''
    const headerVal = process.env.JOB_SCHEDULER_HEADER_VALUE || ''
    if (headerName && headerVal) {
      const val = request.headers.get(headerName.toLowerCase()) || ''
      if (val === headerVal) return null
    }

    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Production additional checks failed' },
      { status: 401 }
    )
  }

  return NextResponse.json(
    { error: 'UNAUTHORIZED', message: 'Invalid or missing job trigger secret' },
    { status: 401 }
  )
}
