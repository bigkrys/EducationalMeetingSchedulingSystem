'use client'

import React from 'react'
import { useEffect, useState, useCallback } from 'react'
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
    return () => {
      mounted = false
    }
  }, [])

  if (loading)
    return <PageLoader message="正在加载用户信息" description="正在获取您的个人资料和权限设置" />
  if (!user) return <PageLoader message="用户验证失败" description="请重新登录或稍后重试" />

  return <DashboardContent initialUser={user} />
}
