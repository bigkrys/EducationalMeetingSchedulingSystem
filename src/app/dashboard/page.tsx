"use client"

import React from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { userService, User, clearUserCache } from '@/lib/api/user-service'
import PageLoader from '@/components/shared/PageLoader'
import DashboardContent from '@/components/dashboard/DashboardContent'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      try {
        const u = await userService.getCurrentUser()
        if (mounted) setUser(u)
      } catch (err) {
        console.error('Failed to load user in dashboard:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch (e) { console.error(e) }
    try { clearUserCache() } catch (_) {}
    try { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); localStorage.removeItem('userRole') } catch (_) {}
    router.push('/')
  }

  if (loading) return <PageLoader message="正在加载用户信息" description="正在获取您的个人资料和权限设置" />
  if (!user) return <PageLoader message="用户验证失败" description="请重新登录或稍后重试" />

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">欢迎回来，{user.name}！</h1>
          <p className="text-gray-600">教育会议调度系统 - 智能预约平台</p>
        </div>

        <button onClick={handleLogout} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">登出</button>
      </div>

  {/* 直接在上层决定并渲染 DashboardContent，内部根据 role 展示不同功能区域 */}
  <DashboardContent initialUser={user} />
    </div>
  )
}
