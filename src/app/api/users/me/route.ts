import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/api/middleware'
import { prisma } from '@/lib/api/db'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { withSentryRoute } from '@/lib/monitoring/sentry'

// very small in-process cache to speed up repeated /api/users/me calls during short periods
// NOTE: in production (serverless) this may not be effective across instances; use Redis for multi-instance caching
const userMeCache = new Map<string, { expiresAt: number; data: any }>()
const USER_ME_TTL_MS = 5 * 1000 // 5 seconds

async function handler(request: AuthenticatedRequest) {
  try {
    const userId = request.user!.userId
    const role = request.user!.role

    // serve from short-lived cache when available
    const cached = userMeCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return ok(cached.data)
    }

    // 根据角色裁剪选择字段，减少不必要的关联查询
    const selectBase: any = { id: true, email: true, role: true, name: true }
    const selectStudent = {
      id: true,
      serviceLevel: true,
      monthlyMeetingsUsed: true,
      studentSubjects: { select: { subject: { select: { name: true } } } },
    }
    const selectTeacher = {
      id: true,
      maxDailyMeetings: true,
      bufferMinutes: true,
      teacherSubjects: { select: { subject: { select: { name: true } } } },
    }

    const select: any = { ...selectBase }
    if (role === 'student') select.student = { select: selectStudent }
    else if (role === 'teacher') select.teacher = { select: selectTeacher }
    else {
      // 对 admin/superadmin 默认不取重型关联，页面通常不依赖这些字段
      select.student = { select: { id: true } }
      select.teacher = { select: { id: true } }
    }

    const user = (await prisma.user.findUnique({ where: { id: userId }, select })) as any

    if (!user) {
      return fail('User not found', 404, 'USER_NOT_FOUND')
    }

    // 构建响应数据
    const userData: any = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    }
    if (user.student) {
      userData.student = {
        id: user.student.id,
        serviceLevel: user.student.serviceLevel,
        monthlyMeetingsUsed: user.student.monthlyMeetingsUsed,
        enrolledSubjects: (user.student.studentSubjects || []).map((ss: any) => ss.subject.name),
      }
    }
    if (user.teacher) {
      userData.teacher = {
        id: user.teacher.id,
        maxDailyMeetings: user.teacher.maxDailyMeetings,
        bufferMinutes: user.teacher.bufferMinutes,
        subjects: (user.teacher.teacherSubjects || []).map((ts: any) => ts.subject.name),
      }
    }

    // put into short-lived cache
    try {
      userMeCache.set(userId, { expiresAt: Date.now() + USER_ME_TTL_MS, data: userData })
    } catch (_) {}

    // ETag 支持：便于浏览器/边缘做 304 短路
    const body = JSON.stringify({ ok: true, ...userData })
    const etag = `W/"${Buffer.from(String(userData.id)).toString('base64')}.${body.length}"`

    const ifNoneMatch = request.headers.get('if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null as any, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
        },
      })
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: etag,
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    })
  } catch (error: any) {
    // If Prisma reports that DB is unreachable (P1001) or initialization error, return 503
    logger.error('user.me.exception', { ...getRequestMeta(request), error: String(error) })

    const code = error?.code || error?.name

    if (code === 'P1001' || code === 'PrismaClientInitializationError') {
      return fail('Database unavailable', 503, 'DB_UNAVAILABLE')
    }

    return fail('Failed to fetch user info', 500, 'INTERNAL_SERVER_ERROR')
  }
}

export const GET = withAuth(withSentryRoute(handler as any, 'api GET /api/users/me'))
