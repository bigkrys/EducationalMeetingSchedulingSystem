'use client'

export const dynamic = 'force-dynamic'

import React from 'react'
import { Card, Typography, Button } from 'antd'
import { useRouter } from 'next/navigation'

const { Title, Text } = Typography

export default function AdminDashboard() {
  const router = useRouter()

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <div className="text-center">
          <Title level={2}>管理员功能</Title>
          <Text type="secondary">
            管理员功能正在开发中，敬请期待...
          </Text>
          <div className="mt-4">
            <Button 
              type="primary" 
              onClick={() => router.push('/dashboard')}
            >
              返回主控制台
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}