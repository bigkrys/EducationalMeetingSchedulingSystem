import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/api/middleware'
import { prisma } from '@/lib/api/db'

// very small in-process cache to speed up repeated /api/users/me calls during short periods
// NOTE: in production (serverless) this may not be effective across instances; use Redis for multi-instance caching
const userMeCache = new Map<string, { expiresAt: number; data: any }>()
const USER_ME_TTL_MS = 5 * 1000 // 5 seconds

async function handler(request: AuthenticatedRequest) {
  try {
    const userId = request.user!.userId

    // serve from short-lived cache when available
    const cached = userMeCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data)
    }

    // 从数据库获取用户信息
    // select narrowly to reduce join cost and payload
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        student: {
          select: {
            id: true,
            serviceLevel: true,
            monthlyMeetingsUsed: true,
            // studentSubjects -> subject.name
            studentSubjects: {
              select: {
                subject: { select: { name: true } }
              }
            }
          }
        },
        teacher: {
          select: {
            id: true,
            maxDailyMeetings: true,
            bufferMinutes: true,
            teacherSubjects: {
              select: { subject: { select: { name: true } } }
            }
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404 }
      )
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
        enrolledSubjects: user.student.studentSubjects.map((ss: any) => ss.subject.name)
      }
    }
    if (user.teacher) {
      userData.teacher = {
        id: user.teacher.id,
        maxDailyMeetings: user.teacher.maxDailyMeetings,
        bufferMinutes: user.teacher.bufferMinutes,
        subjects: user.teacher.teacherSubjects.map((ts: any) => ts.subject.name)
      }
    }

    // put into short-lived cache
    try {
      userMeCache.set(userId, { expiresAt: Date.now() + USER_ME_TTL_MS, data: userData })
    } catch (_) { }

    return NextResponse.json(userData)
  } catch (error: any) {
    // If Prisma reports that DB is unreachable (P1001) or initialization error, return 503
    console.error('Error fetching user info:', error)

    const code = error?.code || error?.name

    if (code === 'P1001' || code === 'PrismaClientInitializationError') {
      return NextResponse.json(
        { error: 'DB_UNAVAILABLE', message: 'Database unavailable' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch user info' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler)
