'use client'

import React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { userService, User, clearUserCache } from '@/lib/api/user-service'
import PageLoader from '@/components/shared/PageLoader'
import DashboardContent from '@/components/dashboard/DashboardContent'
import * as Sentry from '@sentry/nextjs'
import { incr } from '@/lib/frontend/metrics'

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
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
        try {
          const t1 = typeof performance !== 'undefined' ? performance.now() : 0
          Sentry.metrics.distribution('dashboard_home_load_ms', Math.max(0, t1 - t0))
          incr('biz.page.view', 1, { page: 'dashboard_home' })
        } catch {}
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
