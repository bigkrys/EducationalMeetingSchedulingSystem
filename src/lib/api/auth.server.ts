import crypto from 'crypto'
import { prisma } from './db'
import { generateAccessToken, generateRefreshToken, JWTPayload } from './jwt'

// optional bcrypt implementation: prefer native `bcrypt` if available (faster), else fallback to `bcryptjs`
let _bcrypt: any | null = null
async function getBcrypt() {
  if (_bcrypt) return _bcrypt
  try {
    const mod = await import('bcrypt')
    _bcrypt = mod?.default ?? mod
  } catch (e) {
    const mod = await import('bcryptjs')
    _bcrypt = mod?.default ?? mod
  }
  return _bcrypt
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await getBcrypt()
  const saltRounds = 10
  return bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await getBcrypt()
  return bcrypt.compare(password, hash)
}

export async function authenticateUser(email: string, password: string) {
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

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    }

    console.time(labels.gen)
    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)
    console.timeEnd(labels.gen)

    // store refresh token hash in background to avoid adding I/O latency to login response
    console.time(labels.store)
    ;(async () => {
      try {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
        await prisma.refreshToken.upsert({
          where: { tokenHash },
          update: {
            userId: user.id,
            revoked: false,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          },
          create: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        })
      } catch (e: any) {
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
    try { console.timeEnd(labels.total) } catch (_) {}
    throw error
  }
}
