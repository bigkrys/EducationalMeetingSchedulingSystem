import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  revokeRefreshToken,
} from '@/lib/api/jwt'
import { prisma } from '@/lib/api/db'
import { JWTPayload } from '@/lib/api/jwt'
import crypto from 'crypto'
import { prisma as prismaClient } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 或 header 获取 refresh token
    const refreshToken =
      request.cookies.get('refreshToken')?.value || request.headers.get('refresh-token')

    if (!refreshToken) {
      return fail('Refresh token required', 401, 'AUTH_MISSING_REFRESH_TOKEN')
    }

    // 验证 refresh token
    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      return fail('Invalid refresh token', 401, 'AUTH_INVALID_REFRESH_TOKEN')
    }

    // 检查 token 是否在数据库中且未撤销（数据库中存储的是 refresh token 的 sha256 哈希）
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      return fail('Refresh token expired or revoked', 401, 'AUTH_INVALID_REFRESH_TOKEN')
    }

    // 生成新的 token
    const newPayload: JWTPayload = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    }

    const newAccessToken = generateAccessToken(newPayload)
    const newRefreshToken = generateRefreshToken(newPayload)

    // 撤销旧 token 并创建新 token
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex')
    await Promise.all([
      revokeRefreshToken(tokenHash),
      prisma.refreshToken.create({
        data: {
          userId: payload.userId,
          tokenHash: newTokenHash,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      }),
    ])

    // 设置新的 HttpOnly cookie
    const response = ok({ accessToken: newAccessToken, refreshToken: newRefreshToken })

    response.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // 记录审计日志（refresh token 成功）
    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: payload.userId,
          action: 'refresh_token',
          details: JSON.stringify({ ip: request.headers.get('x-forwarded-for') || 'unknown' }),
        },
      })
    } catch (e) {
      logger.warn('audit.refresh.write_failed', { ...getRequestMeta(request), error: String(e) })
    }

    return response
  } catch (error) {
    logger.error('token.refresh.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Token refresh failed', 500, 'INVALID')
  }
}
