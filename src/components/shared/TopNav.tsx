'use client'

import React from 'react'
import Link from 'next/link'
import { Button, Space } from 'antd'
import { useAuth } from '@/components/shared/AuthProvider'

export default function TopNav() {
  const { accessToken, role } = useAuth()
  const authed = !!accessToken
  if (!authed) return null

  const isAdmin = role === 'admin' || role === 'superadmin'

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <div
        className="container mx-auto px-4 py-2"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Link href="/dashboard">
          <Button type="link">控制台</Button>
        </Link>
        <Space>
          {isAdmin && (
            <>
              <Link href="/dashboard/admin">
                <Button type="link">管理员</Button>
              </Link>
              <Link href="/dashboard/admin/users">
                <Button type="link">用户</Button>
              </Link>
              <Link href="/dashboard/admin/policies">
                <Button type="link">策略</Button>
              </Link>
              <Link href="/dashboard/admin/audit-logs">
                <Button type="link">审计</Button>
              </Link>
              <Link href="/dashboard/admin/tasks">
                <Button type="link">系统任务</Button>
              </Link>
            </>
          )}
        </Space>
      </div>
    </div>
  )
}
