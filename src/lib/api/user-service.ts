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
    enrolledSubjects: string
  }
  teacher?: {
    id: string
    subjects: string
    maxDailyMeetings: number
    bufferMinutes: number
  }
}

export class UserService {
  // 获取当前用户信息
  static async getCurrentUser(): Promise<User> {
    const response = await api.get('/api/users/me')
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.status}`)
    }
    
    return response.json()
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
