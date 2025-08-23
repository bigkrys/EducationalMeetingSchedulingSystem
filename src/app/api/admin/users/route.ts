import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { withRole } from '@/lib/api/middleware'

async function getUsersHandler(request: NextRequest, context?: any) {
  try {
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // 构建查询条件
    const where: any = {}
    
    if (role) {
      where.role = role
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }

    // 获取用户总数
    const total = await prisma.user.count({ where })

    // 获取用户列表
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    })

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })

  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

async function createUserHandler(request: NextRequest, context?: any) {
  try {
    const body = await request.json()
    const { email, name, role, password } = body

    if (!email || !name || !role || !password) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'EMAIL_EXISTS', message: 'Email already registered' },
        { status: 409 }
      )
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        password: password, // 注意：实际应该哈希密码
        isActive: true
      }
    })

    // 根据角色创建相应的记录
    if (role === 'student') {
      await prisma.student.create({
        data: {
          userId: user.id,
          serviceLevel: 'level1',
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date()
        }
      })
    } else if (role === 'teacher') {
      await prisma.teacher.create({
        data: {
          userId: user.id,
          maxDailyMeetings: 6,
          bufferMinutes: 15
        }
      })
    }

    return NextResponse.json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to create user' },
      { status: 500 }
    )
  }
}

export const GET = withRole('admin')(getUsersHandler)
export const POST = withRole('admin')(createUserHandler)
