import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, JWTPayload } from './jwt'

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload
}

export function withAuth(handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>, requiredRoles?: string[]) {
  return async (req: NextRequest, context?: any) => {
    try {
      const authHeader = req.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'INVALID', message: 'Missing or invalid authorization header' }, { status: 401 })
      }

      const token = authHeader.substring(7)
      const payload = verifyAccessToken(token)
      
      if (!payload) {
        return NextResponse.json({ error: 'INVALID', message: 'Invalid or expired token' }, { status: 401 })
      }

      // 检查角色权限
      if (requiredRoles && !requiredRoles.includes(payload.role)) {
        return NextResponse.json({ error: 'FORBIDDEN', message: 'Insufficient permissions' }, { status: 403 })
      }

      // 将用户信息添加到请求对象
      const authenticatedReq = req as AuthenticatedRequest
      authenticatedReq.user = payload

      return handler(authenticatedReq, context)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json({ error: 'INVALID', message: 'Authentication failed' }, { status: 401 })
    }
  }
}

export function withRole(role: string) {
  return (handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
    return withAuth(handler, [role])
  }
}

export function withRoles(roles: string[]) {
  return (handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
    return withAuth(handler, roles)
  }
}
