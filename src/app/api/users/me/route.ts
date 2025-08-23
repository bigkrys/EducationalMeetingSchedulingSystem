import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/api/middleware'
import { prisma } from '@/lib/api/db'

async function handler(request: AuthenticatedRequest) {
  try {
    const userId = request.user!.userId

    // 从数据库获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: {
          include: {
            studentSubjects: {
              include: {
                subject: true
              }
            }
          }
        },
        teacher: {
          include: {
            teacherSubjects: {
              include: {
                subject: true
              }
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
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      student: user.student ? {
        id: user.student.id,
        serviceLevel: user.student.serviceLevel,
        monthlyMeetingsUsed: user.student.monthlyMeetingsUsed,
        enrolledSubjects: user.student.studentSubjects.map((ss: any) => ss.subject.name).join(', ')
      } : undefined,
      teacher: user.teacher ? {
        id: user.teacher.id,
        subjects: user.teacher.teacherSubjects.map((ts: any) => ts.subject.name).join(', '),
        maxDailyMeetings: user.teacher.maxDailyMeetings,
        bufferMinutes: user.teacher.bufferMinutes
      } : undefined
    }

    return NextResponse.json(userData)
  } catch (error) {
    console.error('Error fetching user info:', error)
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch user info' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler)
