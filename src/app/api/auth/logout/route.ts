import { NextRequest, NextResponse } from 'next/server'
import { revokeRefreshToken } from '@/lib/api/jwt'
import crypto from 'crypto'
import { withSentryRoute } from '@/lib/monitoring/sentry'

async function postHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken =
      request.cookies.get('refreshToken')?.value || request.headers.get('refresh-token')

    if (refreshToken) {
      // 撤销 refresh token（数据库中存储的是 sha256）
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      await revokeRefreshToken(tokenHash)
    }

    const response = new NextResponse(null, { status: 204 })

    // 清除 cookies（access + refresh）
    response.cookies.delete('accessToken')
    response.cookies.delete('refreshToken')

    return response
  } catch (error) {
    console.error('Logout error:', error)
    // 即使出错也要清除 cookies
    const response = new NextResponse(null, { status: 204 })
    response.cookies.delete('accessToken')
    response.cookies.delete('refreshToken')
    return response
  }
}

// 明确给导出函数加上类型，确保 Next.js 路由类型检查能正确推断返回值
export const POST: (request: NextRequest) => Promise<NextResponse> = withSentryRoute(
  postHandler,
  'api POST /api/auth/logout'
) as any
