import { NextRequest } from 'next/server'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/api/db'
import { memoryCache } from '@/lib/api/cache'
import { ok, fail } from '@/lib/api/response'
import { withRateLimit } from '@/lib/api/middleware'
import { withSentryRoute, span, metricsIncrement } from '@/lib/monitoring/sentry'

const CACHE_KEY = 'insights:teacher-radar:v1'
const CACHE_TTL = 60 * 1000

type TeacherStat = {
  teacherId: string
  teacherName: string
  subjects: string[]
  appointmentsNext7d: number
  waitlistNext7d: number
}

async function buildTeacherStats(): Promise<{
  generatedAt: string
  hot: TeacherStat[]
  open: TeacherStat[]
}> {
  const cached = memoryCache.get(CACHE_KEY)
  if (cached) {
    return cached
  }

  const now = new Date()
  const nextWindow = addDays(now, 7)

  const [appointmentAgg, waitlistAgg] = await Promise.all([
    span('teacher-radar.appointments.groupBy', () =>
      prisma.appointment.groupBy({
        where: {
          scheduledTime: { gte: now, lt: nextWindow },
          status: { in: ['pending', 'approved'] },
        },
        by: ['teacherId'],
        _count: { _all: true },
      })
    ),
    span('teacher-radar.waitlist.groupBy', () =>
      prisma.waitlist.groupBy({
        where: {
          slot: { gte: now, lt: nextWindow },
          status: { in: ['active', 'promoted'] },
        },
        by: ['teacherId'],
        _count: { _all: true },
      })
    ),
  ])

  const appointmentMap = new Map<string, number>()
  for (const row of appointmentAgg) {
    appointmentMap.set(row.teacherId, row._count._all)
  }

  const waitlistMap = new Map<string, number>()
  for (const row of waitlistAgg) {
    waitlistMap.set(row.teacherId, row._count._all)
  }

  const busyTeacherIds = new Set<string>([
    ...appointmentAgg.map((row) => row.teacherId),
    ...waitlistAgg.map((row) => row.teacherId),
  ])

  // 拉取热门教师 + 额外候选用于空闲教师
  const busyIdList = Array.from(busyTeacherIds)

  // 若热门老师不足，补充最近活跃教师，避免空列表
  const extraTeachers = await span('teacher-radar.extra-teachers', () =>
    prisma.teacher.findMany({
      where: busyIdList.length ? { id: { notIn: busyIdList } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: {
        id: true,
        user: { select: { name: true } },
        teacherSubjects: {
          select: { subject: { select: { name: true } } },
          take: 6,
        },
      },
    })
  )

  const candidateIds = new Set<string>([...busyIdList, ...extraTeachers.map((t) => t.id)])

  const teacherRecords = await span('teacher-radar.teacher-records', () =>
    prisma.teacher.findMany({
      where: { id: { in: Array.from(candidateIds) } },
      select: {
        id: true,
        user: { select: { name: true } },
        teacherSubjects: {
          select: { subject: { select: { name: true } } },
          take: 6,
        },
      },
    })
  )

  const stats: TeacherStat[] = teacherRecords.map((teacher) => ({
    teacherId: teacher.id,
    teacherName: teacher.user?.name || '未命名教师',
    subjects: teacher.teacherSubjects.map((ts) => ts.subject.name),
    appointmentsNext7d: appointmentMap.get(teacher.id) || 0,
    waitlistNext7d: waitlistMap.get(teacher.id) || 0,
  }))

  const hot = stats
    .filter((s) => s.appointmentsNext7d + s.waitlistNext7d > 0)
    .sort((a, b) => {
      const scoreA = a.waitlistNext7d * 10 + a.appointmentsNext7d
      const scoreB = b.waitlistNext7d * 10 + b.appointmentsNext7d
      return scoreB - scoreA || a.teacherName.localeCompare(b.teacherName)
    })
    .slice(0, 3)

  const hotIds = new Set(hot.map((item) => item.teacherId))

  const open = stats
    .slice()
    .sort((a, b) => {
      const scoreA = a.appointmentsNext7d + a.waitlistNext7d
      const scoreB = b.appointmentsNext7d + b.waitlistNext7d
      if (scoreA !== scoreB) return scoreA - scoreB
      return a.teacherName.localeCompare(b.teacherName)
    })
    .filter((stat) => !hotIds.has(stat.teacherId))
    .slice(0, 3)

  const payload = {
    generatedAt: now.toISOString(),
    hot,
    open,
  }

  memoryCache.set(CACHE_KEY, payload, CACHE_TTL)
  return payload
}

async function getHandler(_request: NextRequest) {
  try {
    const data = await buildTeacherStats()
    try {
      metricsIncrement('feature.teacher_radar.api', 1)
    } catch {}
    return ok(data, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    return fail('Failed to build teacher radar', 500, 'INTERNAL_ERROR')
  }
}

export const GET = withRateLimit({ windowMs: 60 * 1000, max: 60 })(
  withSentryRoute(getHandler, 'api GET /api/insights/teacher-radar')
)
