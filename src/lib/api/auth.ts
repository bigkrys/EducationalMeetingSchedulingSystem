import bcrypt from 'bcryptjs'
import { prisma } from './db'
import { generateAccessToken, generateRefreshToken, JWTPayload } from './jwt'

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // 生产环境只使用 bcrypt 验证
  return bcrypt.compare(password, hash)
}

export async function authenticateUser(email: string, password: string) {
  // generate per-request unique labels to avoid console.time label collisions
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  const labels = {
    total: `auth:total:${email}:${uniq}`,
    dbFind: `auth:db-find:${email}:${uniq}`,
    verify: `auth:verify-password:${email}:${uniq}`,
    gen: `auth:generate-tokens:${email}:${uniq}`,
    store: `auth:store-refresh:${email}:${uniq}`
  }

  console.time(labels.total)
  try {
    console.time(labels.dbFind)
    // only select minimal fields required for authentication to reduce DB latency
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        name: true
      }
    })
    console.timeEnd(labels.dbFind)

    if (!user) {
      console.timeEnd(labels.total)
      return null
    }

  console.time(labels.verify)
  const isValidPassword = await verifyPassword(password, user.passwordHash)
  console.timeEnd(labels.verify)
    if (!isValidPassword) {
      console.timeEnd(labels.total)
      return null
    }

    // Update last login (optional)
    // await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    }

    console.time(labels.gen)
    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)
    console.timeEnd(labels.gen)

    // store refresh token in background to avoid adding I/O latency to login response
    console.time(labels.store)
    ;(async () => {
      try {
        await prisma.refreshToken.upsert({
          where: { tokenHash: refreshToken },
          update: {
            userId: user.id,
            revoked: false,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          },
          create: {
            userId: user.id,
            tokenHash: refreshToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        })
      } catch (e: any) {
        // background failure should be logged but not block login
        console.error('Failed to store refresh token (background):', e)
      } finally {
        try { console.timeEnd(labels.store) } catch (_) {}
      }
    })()

  console.timeEnd(labels.total)

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      accessToken,
      refreshToken
    }
  } catch (error) {
    // ensure total timer is ended on unexpected error
    try { console.timeEnd(labels.total) } catch (_) {}
    throw error
  }
}

// Token 自动刷新相关函数
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken })
    })

    if (response.ok) {
      const data = await response.json()
      return data.accessToken
    }
    return null
  } catch (error) {
    console.error('Token refresh failed:', error)
    return null
  }
}

// 检查token是否即将过期（提前5分钟刷新）
export function isTokenExpiringSoon(token: string): boolean {
  try {
    const decoded = JSON.parse(atob(token.split('.')[1]))
    const expirationTime = decoded.exp * 1000 // 转换为毫秒
    const currentTime = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    
    return (expirationTime - currentTime) < fiveMinutes
  } catch (error) {
    return true // 如果解析失败，认为需要刷新
  }
}

// 获取存储的token
export function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null }
  }
  
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken')
  }
}

// 存储token
export function storeTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

// 清除存储的token
export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return
  
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

// 检查用户是否已认证
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) return false
  
  // 检查token是否过期
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    const currentTime = Date.now() / 1000
    return decoded.exp > currentTime
  } catch (error) {
    return false
  }
}

// 获取当前用户角色
export function getCurrentUserRole(): string | null {
  if (typeof window === 'undefined') return null
  
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) return null
  
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.role
  } catch (error) {
    return null
  }
}

// 获取当前用户ID
export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) return null
  
  try {
    const decoded = JSON.parse(atob(accessToken.split('.')[1]))
    return decoded.userId
  } catch (error) {
    return null
  }
}
