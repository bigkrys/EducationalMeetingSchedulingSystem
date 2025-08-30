import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken, generateAccessToken, generateRefreshToken, revokeRefreshToken } from '@/lib/api/jwt'
import { prisma } from '@/lib/api/db'
import { JWTPayload } from '@/lib/api/jwt'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 或 header 获取 refresh token
    const refreshToken = request.cookies.get('refreshToken')?.value || 
                        request.headers.get('refresh-token')

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'INVALID', message: 'Refresh token required' },
        { status: 401 }
      )
    }

    // 验证 refresh token
    const payload = verifyRefreshToken(refreshToken)
    if (!payload) {
      return NextResponse.json(
        { error: 'INVALID', message: 'Invalid refresh token' },
        { status: 401 }
      )
    }

    // 检查 token 是否在数据库中且未撤销（数据库中存储的是 refresh token 的 sha256 哈希）
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    })

    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'INVALID', message: 'Refresh token expired or revoked' },
        { status: 401 }
      )
    }

    // 生成新的 token
    const newPayload: JWTPayload = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role
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
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      })
    ])

    // 设置新的 HttpOnly cookie
    const response = NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    })

    response.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })

    return response

  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: 'INVALID', message: 'Token refresh failed' },
      { status: 500 }
    )
  }
}
