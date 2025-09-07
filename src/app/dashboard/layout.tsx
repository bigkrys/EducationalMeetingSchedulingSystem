'use client'

import React, { useEffect, useState } from 'react'
import { Layout, Button } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import DashboardSideNav from '@/components/dashboard/SideNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setMounted(true)
    const onResize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200
      const isLg = width >= 992
      setIsMobile(!isLg)
      setCollapsed(!isLg) // desktop expand, mobile collapse
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const paddingLeft = mounted && !isMobile && !collapsed ? 220 : 0
  const contentPadding = mounted && isMobile ? 12 : 24

  return (
    <Layout>
      <DashboardSideNav collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout style={{ paddingLeft, minHeight: '100vh', background: '#f5f5f5' }}>
        {/* 顶部栏（移动端） */}
        {mounted && isMobile && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 850,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 12px',
              background: '#fff',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(false)}>
              菜单
            </Button>
            <div style={{ fontWeight: 600, fontSize: 16 }}>个人控制台</div>
          </div>
        )}

        {/* 遮罩层：移动端展开侧栏时显示，点击关闭 */}
        {mounted && isMobile && !collapsed && (
          <div
            onClick={() => setCollapsed(true)}
            aria-hidden
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 800 }}
          />
        )}

        <main style={{ padding: contentPadding, overflowX: 'hidden' }}>{children}</main>
      </Layout>
    </Layout>
  )
}
