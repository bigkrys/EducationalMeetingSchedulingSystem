import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api/auth'
import { loginSchema } from '@/lib/api/validation'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = loginSchema.parse(body)

    const result = await authenticateUser(validatedData.email, validatedData.password)
    
    if (!result) {
      return NextResponse.json(
        { error: 'INVALID', message: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // 设置 HttpOnly cookie
    const response = NextResponse.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      role: result.user.role
    })

    // 设置 refresh token 为 HttpOnly cookie
    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })

    return response

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid input data' },
        { status: 400 }
      )
    }

    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'INVALID', message: 'Login failed' },
      { status: 500 }
    )
  }
}
