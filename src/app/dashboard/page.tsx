'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { userService, User } from '@/lib/api/user-service'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const userData = await userService.getCurrentUser()
      setUser(userData)
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    // 清除本地存储的认证信息
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userRole')
    
    // 跳转到首页
    router.push('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">用户未找到</h1>
          <p className="text-gray-600">请先登录</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 顶部导航栏 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            欢迎回来，{user.name}！
          </h1>
          <p className="text-gray-600">
            教育会议调度系统 - 智能预约平台
          </p>
        </div>
        
        {/* 退出按钮 */}
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
        >
          退出登录
        </button>
      </div>

      {/* 用户信息卡片 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">用户信息</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">姓名</label>
            <p className="text-lg font-semibold">{user.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">邮箱</label>
            <p className="text-lg font-semibold">{user.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">角色</label>
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {user.role === 'student' && '学生'}
              {user.role === 'teacher' && '教师'}
              {user.role === 'admin' && '管理员'}
            </span>
          </div>
          
          {user.role === 'student' && user.student && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-500">服务级别</label>
                <p className="text-lg font-semibold">
                  {user.student.serviceLevel === 'level1' && '一级'}
                  {user.student.serviceLevel === 'level2' && '二级'}
                  {user.student.serviceLevel === 'premium' && '高级'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">本月已使用次数</label>
                <p className="text-lg font-semibold">{user.student.monthlyMeetingsUsed || 0}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">已注册科目</label>
                <p className="text-lg font-semibold">
                  {user.student.enrolledSubjects || '无'}
                </p>
              </div>
            </>
          )}
          
          {user.role === 'teacher' && user.teacher && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-500">每日最大预约数</label>
                <p className="text-lg font-semibold">{user.teacher.maxDailyMeetings}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">缓冲时间</label>
                <p className="text-lg font-semibold">{user.teacher.bufferMinutes} 分钟</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 功能菜单 */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">功能菜单</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {user.role === 'student' && (
            <>
              <Link href="/dashboard/book-appointment" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      预约会议
                    </h3>
                    <p className="text-sm text-gray-500">
                      查看教师可用时间并预约会议
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/my-appointments" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      我的预约
                    </h3>
                    <p className="text-sm text-gray-500">
                      查看和管理您的所有预约
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/waitlist" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      候补队列
                    </h3>
                    <p className="text-sm text-gray-500">
                      加入热门时段的候补队列
                    </p>
                  </div>
                </div>
              </Link>
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <Link href="/dashboard/availability" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      设置可用性
                    </h3>
                    <p className="text-sm text-gray-500">
                      设置您的每周可用时间
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/appointments" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      预约管理
                    </h3>
                    <p className="text-sm text-gray-500">
                      查看和审批学生预约
                    </p>
                  </div>
                </div>
              </Link>

            
            </>
          )}

          {user.role === 'admin' && (
            <>
              <Link href="/admin/policies" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      服务策略
                    </h3>
                    <p className="text-sm text-gray-500">
                      管理系统服务级别策略
                    </p>
                  </div>
                </div>
              </Link>

              <Link href="/admin" className="block">
                <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                      系统任务
                    </h3>
                    <p className="text-sm text-gray-500">
                      执行系统维护任务
                    </p>
                  </div>
                </div>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
