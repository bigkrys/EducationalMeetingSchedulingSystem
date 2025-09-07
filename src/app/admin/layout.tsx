'use client'

import React, { useEffect, useState } from 'react'
import { Layout, Button } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import SideNav from '@/components/admin/SideNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setMounted(true)
    const onResize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200
      const isLg = width >= 992
      setIsMobile(!isLg)
      setCollapsed(!isLg)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const paddingLeft = mounted && !collapsed && !isMobile ? 220 : 0
  const contentPadding = mounted && isMobile ? 16 : 24

  return (
    <Layout>
      <SideNav collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout style={{ paddingLeft, minHeight: '100vh', background: '#f5f5f5' }}>
        {/* 移动端顶栏 */}
        {mounted && isMobile && (
          <div
            style={{
              position: 'fixed',
              insetInlineStart: 0,
              top: 0,
              right: 0,
              height: 52,
              background: '#fff',
              borderBottom: '1px solid #f0f0f0',
              zIndex: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
            }}
          >
            <Button icon={<MenuOutlined />} onClick={() => setCollapsed(false)}>
              菜单
            </Button>
            <div style={{ fontWeight: 600 }}>管理控制台</div>
            <span />
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

        <main style={{ padding: contentPadding, marginTop: mounted && isMobile ? 52 : 0 }}>
          {children}
        </main>
      </Layout>
    </Layout>
  )
}
