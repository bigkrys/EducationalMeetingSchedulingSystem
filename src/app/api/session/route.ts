import { NextRequest } from 'next/server'
import { ok } from '@/lib/api/response'
import { prisma } from '@/lib/api/db'
import { verifyAccessToken } from '@/lib/api/jwt'
import jwt from 'jsonwebtoken'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const access = request.cookies.get('accessToken')?.value || ''
    if (!access) {
      return ok({ ok: false, loggedIn: false })
    }
    const payload = verifyAccessToken(access)
    if (!payload) {
      return ok({ ok: false, loggedIn: false })
    }
    let name: string | null = null
    try {
      const u = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true },
      })
      name = u?.name ?? null
    } catch {}

    let exp: number | null = null
    try {
      const decoded: any = jwt.decode(access)
      exp = decoded?.exp ? decoded.exp * 1000 : null
    } catch {}

    return ok(
      {
        ok: true,
        loggedIn: true,
        user: { id: payload.userId, email: payload.email, role: payload.role, name },
        exp,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    )
  } catch (e) {
    return ok(
      { ok: false, loggedIn: false },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    )
  }
}
