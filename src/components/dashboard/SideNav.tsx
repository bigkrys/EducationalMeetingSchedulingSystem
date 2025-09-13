'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Layout, Menu } from 'antd'
import {
  HomeOutlined,
  CalendarOutlined,
  FileTextOutlined,
  SettingOutlined,
  BarChartOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/components/shared/AuthProvider'
import { clearAuthToken } from '@/lib/frontend/auth'
import { clearStoredTokens } from '@/lib/api/auth'
import { usePathname } from 'next/navigation'
import { clearUserCache } from '@/lib/api/user-service'
const { Sider } = Layout
import { useRouter } from 'next/navigation'
export default function DashboardSideNav({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean
  onCollapse: (c: boolean) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { role, loading, accessToken } = useAuth()
  useEffect(() => {
    setMounted(true)
    const onResize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200
      setIsMobile(width < 992)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      clearUserCache()
      clearAuthToken()
      try {
        clearAuthToken()
      } catch (_) {}
      try {
        clearStoredTokens()
      } catch (_) {}
      fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (_) {
      router.push('/')
    }
  }, [router])

  if (!mounted || loading) return null

  // Base items for all (student/teacher)
  const commonItems: any[] = [
    { key: '/dashboard', icon: <HomeOutlined />, label: <Link href="/dashboard">控制台</Link> },
  ]

  const studentItems: any[] = [
    {
      key: '/dashboard/book-appointment',
      icon: <CalendarOutlined />,
      label: <Link href="/dashboard/book-appointment">预约会议</Link>,
    },
    {
      key: '/dashboard/my-appointments',
      icon: <FileTextOutlined />,
      label: <Link href="/dashboard/my-appointments">我的预约</Link>,
    },
    {
      key: '/dashboard/waitlist',
      icon: <ClockCircleOutlined />,
      label: <Link href="/dashboard/waitlist">候补队列</Link>,
    },
  ]

  const teacherItems: any[] = [
    {
      key: '/dashboard/waitlist',
      icon: <ClockCircleOutlined />,
      label: <Link href="/dashboard/waitlist">候补队列</Link>,
    },
    {
      key: '/dashboard/availability',
      icon: <SettingOutlined />,
      label: <Link href="/dashboard/availability">设置可用性</Link>,
    },
    {
      key: '/dashboard/appointments',
      icon: <TeamOutlined />,
      label: <Link href="/dashboard/appointments">预约管理</Link>,
    },
    {
      key: '/dashboard/analytics',
      icon: <BarChartOutlined />,
      label: <Link href="/dashboard/analytics">统计分析</Link>,
    },
  ]

  const adminItems: any[] = [
    {
      key: '/dashboard/admin',
      icon: <HomeOutlined />,
      label: <Link href="/dashboard/admin">管理员</Link>,
    },
    {
      key: '/dashboard/admin/users',
      icon: <TeamOutlined />,
      label: <Link href="/dashboard/admin/users">用户管理</Link>,
    },
    {
      key: '/dashboard/admin/policies',
      icon: <SettingOutlined />,
      label: <Link href="/dashboard/admin/policies">服务策略</Link>,
    },
    {
      key: '/dashboard/admin/audit-logs',
      icon: <FileTextOutlined />,
      label: <Link href="/dashboard/admin/audit-logs">审计日志</Link>,
    },
    {
      key: '/dashboard/admin/tasks',
      icon: <SettingOutlined />,
      label: <Link href="/dashboard/admin/tasks">系统任务</Link>,
    },
    {
      key: '/dashboard/admin/analytics',
      icon: <BarChartOutlined />,
      label: <Link href="/dashboard/admin/analytics">分析</Link>,
    },
  ]

  const items = [
    ...commonItems,
    ...(role === 'student' ? studentItems : []),
    ...(role === 'teacher' ? teacherItems : []),
    ...(role === 'admin' || role === 'superadmin' ? adminItems : []),
    { key: 'logout', icon: <LogoutOutlined />, label: <span onClick={handleLogout}>登出</span> },
  ]

  const selectedKey = items
    .map((i: any) => i.key as string)
    .filter((k: string) => pathname.startsWith(k))
    .sort((a: string, b: string) => b.length - a.length)[0]

  return (
    <Sider
      width={220}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      collapsedWidth={0}
      breakpoint="lg"
      style={{
        position: 'fixed',
        insetInlineStart: 0,
        top: 0,
        height: '100vh',
        zIndex: 1000,
        overflow: 'auto',
      }}
      theme="light"
    >
      <div style={{ padding: 16, fontWeight: 600, fontSize: 16 }}>个人控制台</div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={() => {
          if (isMobile) onCollapse(true)
        }}
      />
    </Sider>
  )
}
