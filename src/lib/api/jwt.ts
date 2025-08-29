import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret'

export interface JWTPayload {
  userId: string
  email: string
  role: string
}
// Small LRU cache implementation to bound memory for token verification cache
class LRUCache<K, V> {
  private maxSize: number
  private map: Map<K, V>

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
    this.map = new Map()
  }

  get(key: K): V | undefined {
    const val = this.map.get(key)
    if (val === undefined) return undefined
    // move to end (most-recently used)
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key)
    }
    this.map.set(key, value)
    if (this.map.size > this.maxSize) {
      // delete least-recently used (first item)
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined) {
        this.map.delete(firstKey)
      }
    }
  }

  delete(key: K) {
    this.map.delete(key)
  }

  size() {
    return this.map.size
  }

  // expose keys iterator for LRU cleanup
  keys() {
    return this.map.keys()
  }

  entries() {
    return this.map.entries()
  }
}

const tokenVerifyCache = new LRUCache<string, { payload: JWTPayload; expiresAt: number }>(5000)

export function generateAccessToken(payload: JWTPayload): string {
  // 开发环境使用更长的token有效期，生产环境使用15分钟
  const ttl = parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '60')
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${ttl}m` as any })
}

export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    // check cache first
    const cached = tokenVerifyCache.get(token)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload & { exp?: number }

    // compute expiry ms from token exp if present, otherwise use short TTL
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + (parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '60') * 60 * 1000)
    tokenVerifyCache.set(token, { payload: decoded as JWTPayload, expiresAt })
    // occasional cleanup: keep cache bounded (naive)
    const CACHE_HIGH_WATER = 5000
    const CACHE_LOW_WATER = 4000
    if (tokenVerifyCache.size() > CACHE_HIGH_WATER) {
      const now = Date.now()
      for (const k of tokenVerifyCache.keys()) {
        // @ts-ignore - access via internal map is intentional for cleanup
        const entry = (tokenVerifyCache as any).map.get(k) as { expiresAt: number }
        if (!entry) continue
        if (entry.expiresAt <= now) tokenVerifyCache.delete(k)
        if (tokenVerifyCache.size() <= CACHE_LOW_WATER) break
      }
    }

    return decoded as JWTPayload
  } catch (error) {
    
    return null
  }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  // dynamic import to avoid initializing prisma during jwt module load
  const { prisma } = await import('./db')
  await prisma.refreshToken.update({ where: { tokenHash }, data: { revoked: true } })
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const { prisma } = await import('./db')
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } })
}
