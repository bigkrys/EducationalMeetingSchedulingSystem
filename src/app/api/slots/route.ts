import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { memoryCache } from '@/lib/api/cache'
import { calculateAvailableSlots } from '@/lib/scheduling'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId')
    const date = searchParams.get('date')
    const durationParam = searchParams.get('duration')
    const duration = parseInt(durationParam || '30')

    // 验证 duration 为正整数
    if (!Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'duration must be a positive integer' },
        { status: 400 }
      )
    }

    if (!teacherId || !date) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'teacherId and date are required' },
        { status: 400 }
      )
    }

    // 检查缓存
  const cacheKey = `slots:${teacherId}:${date}:${duration}`
    const cachedSlots = memoryCache.get(cacheKey)
    if (cachedSlots) {
      return NextResponse.json(cachedSlots)
    }

    // 验证教师是否存在
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: {
        availability: {
          where: { isActive: true }
        },
        blockedTimes: true
      }
    })

    if (!teacher) {
      return NextResponse.json(
        { error: 'TEACHER_NOT_FOUND', message: 'Teacher not found' },
        { status: 404 }
      )
    }

  // 计算可用槽位（逻辑已移动到 lib/scheduling）
  const slots = await calculateAvailableSlots(teacher, date, duration)

    // 缓存结果（5分钟）
    const result = {
      teacherId,
      date,
      duration,
      slots
    }
    memoryCache.set(cacheKey, result, 5 * 60 * 1000)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Get slots error:', error)
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Failed to fetch slots' },
      { status: 500 }
    )
  }
}


