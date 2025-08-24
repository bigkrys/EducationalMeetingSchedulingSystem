import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'

export async function POST(request: NextRequest) {
  try {
    // 检查是否是每月1日（或者手动触发）
    const today = new Date()
    const isFirstDayOfMonth = today.getDate() === 1
    
    if (!isFirstDayOfMonth) {
      // 如果不是每月1日，检查是否有手动触发参数
      const { searchParams } = new URL(request.url)
      const force = searchParams.get('force')
      if (force !== 'true') {
        return NextResponse.json({
          error: 'BAD_REQUEST',
          message: 'Quota reset can only be triggered on the first day of month or with force=true'
        }, { status: 400 })
      }
    }

    // 获取所有需要重置配额的学生
    const studentsToReset = await prisma.student.findMany({
      where: {
        lastQuotaReset: { lt: new Date(today.getFullYear(), today.getMonth(), 1) }
      },
      select: { id: true, monthlyMeetingsUsed: true, lastQuotaReset: true }
    })

    if (studentsToReset.length === 0) {
      return NextResponse.json({
        message: 'No students need quota reset',
        updated: 0
      })
    }

    // 批量重置配额
    const updatePromises = studentsToReset.map(student => 
      prisma.student.update({
        where: { id: student.id },
        data: {
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date(today.getFullYear(), today.getMonth(), 1)
        }
      })
    )

    await Promise.all(updatePromises)

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'QUOTA_RESET',
        details: JSON.stringify({
          resetDate: today.toISOString(),
          studentsCount: studentsToReset.length,
          students: studentsToReset.map(s => ({
            id: s.id,
            previousQuota: s.monthlyMeetingsUsed,
            previousReset: s.lastQuotaReset?.toISOString()
          }))
        })
      }
    })

    return NextResponse.json({
      message: 'Monthly quota reset completed successfully',
      updated: studentsToReset.length,
      resetDate: today.toISOString(),
      details: {
        totalStudents: studentsToReset.length,
        studentsWithQuota: studentsToReset.filter(s => s.monthlyMeetingsUsed > 0).length
      }
    })

  } catch (error) {
    console.error('Quota reset error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to reset monthly quotas' },
      { status: 500 }
    )
  }
}
