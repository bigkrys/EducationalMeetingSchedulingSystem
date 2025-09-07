'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { getCurrentUserRole, isAuthenticated } from '@/lib/api/auth'
import { usePathname } from 'next/navigation'

const { Sider } = Layout

export default function SideNav({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean
  onCollapse: (c: boolean) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setMounted(true)
    setRole(getCurrentUserRole())
    const onResize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200
      setIsMobile(width < 992)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const pathname = usePathname()

  if (!mounted) return null
  const isAdmin = role === 'admin' || role === 'superadmin'
  if (!isAdmin) return null

  const items = [
    { key: '/admin', icon: <DashboardOutlined />, label: <Link href="/admin">仪表盘</Link> },
    {
      key: '/admin/analytics',
      icon: <DashboardOutlined />,
      label: <Link href="/admin/analytics">分析</Link>,
    },
    {
      key: '/admin/users',
      icon: <TeamOutlined />,
      label: <Link href="/admin/users">用户管理</Link>,
    },
    {
      key: '/admin/policies',
      icon: <SafetyCertificateOutlined />,
      label: <Link href="/admin/policies">服务策略</Link>,
    },
    {
      key: '/admin/audit-logs',
      icon: <FileTextOutlined />,
      label: <Link href="/admin/audit-logs">审计日志</Link>,
    },
    {
      key: '/admin/tasks',
      icon: <ToolOutlined />,
      label: <Link href="/admin/tasks">系统任务</Link>,
    },
  ]

  // 选中逻辑：以匹配到的最长前缀为准
  const selectedKey = items
    .map((i) => i.key)
    .filter((k) => pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]

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
      <div style={{ padding: 16, fontWeight: 600, fontSize: 16 }}>管理控制台</div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items as any}
        onClick={() => {
          if (isMobile) onCollapse(true)
        }}
      />
    </Sider>
  )
}
