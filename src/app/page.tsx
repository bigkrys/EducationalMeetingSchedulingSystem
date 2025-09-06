'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LoginForm from '@/components/auth/LoginForm'
import PageLoader from '@/components/shared/PageLoader'
import { isAuthenticated } from '@/lib/api/auth'

export default function Home() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // 检查用户是否已登录
    const checkAuth = async () => {
      try {
        if (isAuthenticated()) {
          // 如果已登录，直接跳转到dashboard
          router.push('/dashboard')
          return
        }
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setChecking(false)
      }
    }

    checkAuth()
  }, [router])

  // 如果正在检查认证状态，显示加载器
  if (checking) {
    return <PageLoader message="正在检查登录状态" description="请稍候，正在验证您的身份..." />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">教育会议调度系统</h1>
          <p className="text-gray-600">欢迎使用智能预约管理平台</p>
        </div>

        {/* 登录注册表单 */}
        <LoginForm />
      </div>
    </div>
  )
}
