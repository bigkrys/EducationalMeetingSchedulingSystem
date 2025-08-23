import { NextRequest, NextResponse } from 'next/server'
import { revokeRefreshToken } from '@/lib/api/jwt'

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refreshToken')?.value || 
                        request.headers.get('refresh-token')

    if (refreshToken) {
      // 撤销 refresh token
      await revokeRefreshToken(refreshToken)
    }

    const response = new NextResponse(null, { status: 204 })
    
    // 清除 cookie
    response.cookies.delete('refreshToken')
    
    return response

  } catch (error) {
    console.error('Logout error:', error)
    // 即使出错也要清除 cookie
    const response = new NextResponse(null, { status: 204 })
    response.cookies.delete('refreshToken')
    return response
  }
}
