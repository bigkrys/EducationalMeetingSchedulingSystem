import jwt from 'jsonwebtoken'
import { prisma } from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret'

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

export function generateAccessToken(payload: JWTPayload): string {
  // 开发环境使用更长的token有效期，生产环境使用15分钟
  const ttl = parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '60')
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${ttl}m` as any })
}

export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('Token expired at:', error.expiredAt)
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.log('Invalid token signature')
    }
    return null
  }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revoked: true }
  })
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true }
  })
}
