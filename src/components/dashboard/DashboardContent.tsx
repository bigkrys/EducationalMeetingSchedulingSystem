'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, Button, Badge, Space, Row, Col, Statistic, Alert, Spin } from 'antd'
import {
  UserOutlined,
  CalendarOutlined,
  SettingOutlined,
  BarChartOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'

interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin' | 'superadmin'
  serviceLevel?: 'level1' | 'level2' | 'premium'
  monthlyMeetingsUsed?: number
  enrolledSubjects?: string[]
  subjects?: string[]
  maxDailyMeetings?: number
  bufferMinutes?: number
  student?: {
    id: string
    serviceLevel?: 'level1' | 'level2' | 'premium'
    monthlyMeetingsUsed?: number
    enrolledSubjects?: string[]
  }
  teacher?: {
    id: string
    maxDailyMeetings?: number
    bufferMinutes?: number
    subjects?: string[]
  }
}

export default function DashboardContent({ initialUser }: { initialUser?: User }) {
  const [user, setUser] = useState<User | null>(initialUser || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialUser) {
      // if parent provided the user, skip fetching
      setLoading(false)
      return
    }

    fetchUserData()
  }, [initialUser])

  const fetchUserData = async () => {
    try {
      setError(null)

      // 检查是否在客户端环境
      if (typeof window === 'undefined') {
        return
      }

      const token = localStorage.getItem('accessToken')
      if (!token) {
        setError('未找到登录信息，请重新登录')
        return
      }

      const response = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else if (response.status === 401) {
        setError('登录已过期，请重新登录')
        // 清除本地存储并跳转到登录页
        localStorage.removeItem('accessToken')
        localStorage.removeItem('userRole')
        window.location.href = '/'
      } else {
        setError('获取用户信息失败')
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <Alert
          message="错误"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  if (!user) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>用户未找到</h1>
          <p style={{ color: '#666' }}>请先登录</p>
          <Button type="primary" onClick={() => (window.location.href = '/')}>
            返回登录
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 用户信息卡片 */}
      <Card
        title={
          <Space>
            <UserOutlined />
            用户信息
          </Space>
        }
        className="mb-8"
      >
        <Row
          gutter={[
            { xs: 8, md: 16 },
            { xs: 8, md: 16 },
          ]}
        >
          <Col xs={24} md={12} lg={8}>
            <Statistic title="姓名" value={user.name} />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Statistic title="邮箱" value={user.email} />
          </Col>
          <Col xs={24} md={12} lg={8}>
            <Statistic
              title="角色"
              value={
                user.role === 'student'
                  ? '学生'
                  : user.role === 'teacher'
                    ? '教师'
                    : user.role === 'admin'
                      ? '管理员'
                      : '超级管理员'
              }
            />
          </Col>

          {user.role === 'student' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Statistic
                  title="服务级别"
                  value={
                    user.student?.serviceLevel === 'level1'
                      ? '一级'
                      : user.student?.serviceLevel === 'level2'
                        ? '二级'
                        : '高级'
                  }
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic title="本月已使用次数" value={user.student?.monthlyMeetingsUsed || 0} />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic
                  title="已注册科目"
                  value={user.student?.enrolledSubjects?.join(', ') || '无'}
                />
              </Col>
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Statistic title="教授科目" value={user.teacher?.subjects?.join(', ') || '无'} />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic title="每日最大预约数" value={user.teacher?.maxDailyMeetings || 0} />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic title="缓冲时间（分钟）" value={user.teacher?.bufferMinutes || 0} />
              </Col>
            </>
          )}
        </Row>
      </Card>
    </div>
  )
}
