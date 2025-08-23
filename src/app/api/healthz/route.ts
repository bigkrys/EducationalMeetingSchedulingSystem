import { NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'

export async function GET() {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`
    
    return NextResponse.json({
      ok: true,
      time: new Date().toISOString(),
      database: 'connected'
    })
  } catch (error) {
    console.error('Health check failed:', error)
    
    return NextResponse.json({
      ok: false,
      time: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 })
  }
}
