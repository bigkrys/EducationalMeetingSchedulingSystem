import { api } from './http-client'

export interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin'
  student?: {
    id: string
    serviceLevel: 'level1' | 'level2' | 'premium'
    monthlyMeetingsUsed: number
  enrolledSubjects: string[]
  }
  teacher?: {
    id: string
  subjects: string[]
    maxDailyMeetings: number
    bufferMinutes: number
  }
}

export class UserService {
  // 获取当前用户信息
  // Simple in-memory cache + in-flight request dedupe
  private static _cachedUser: User | null = null
  private static _cacheTtlMs = 30 * 1000 // cache for 30s
  private static _cacheExpiresAt = 0
  private static _inflight: Promise<User> | null = null

  static async getCurrentUser(): Promise<User> {
    const now = Date.now()

    // return cached if valid
    if (this._cachedUser && now < this._cacheExpiresAt) {
      return Promise.resolve(this._cachedUser)
    }

    // if there is an in-flight request, return it to dedupe
    if (this._inflight) return this._inflight

    // otherwise start fetch and keep reference
    this._inflight = (async () => {
      try {
        const response = await api.get('/api/users/me')

        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.status}`)
        }

        const data = await response.json()

        // normalize and cache
        this._cachedUser = data as User
        this._cacheExpiresAt = Date.now() + this._cacheTtlMs

        return this._cachedUser
      } finally {
        // clear inflight regardless of success/failure so next call can retry
        this._inflight = null
      }
    })()

    return this._inflight
  }

  // 更新用户信息
  static async updateUser(userId: string, data: Partial<User>): Promise<User> {
    const response = await api.patch(`/api/users/${userId}`, data)
    
    if (!response.ok) {
      throw new Error(`Failed to update user: ${response.status}`)
    }
    
    return response.json()
  }

  // 修改密码
  static async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const response = await api.patch('/api/users/me/password', {
      oldPassword,
      newPassword
    })
    
    if (!response.ok) {
      throw new Error(`Failed to change password: ${response.status}`)
    }
  }
}

// 导出便捷函数
export const userService = {
  getCurrentUser: () => UserService.getCurrentUser(),
  updateUser: (userId: string, data: Partial<User>) => UserService.updateUser(userId, data),
  changePassword: (oldPassword: string, newPassword: string) => UserService.changePassword(oldPassword, newPassword)
}

// 清除缓存（在 logout 或 token 变更时调用）
export function clearUserCache() {
  // @ts-ignore
  UserService._cachedUser = null
  // @ts-ignore
  UserService._cacheExpiresAt = 0
  // @ts-ignore
  UserService._inflight = null
}
