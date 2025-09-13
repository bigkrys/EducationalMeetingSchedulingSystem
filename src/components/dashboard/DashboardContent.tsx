'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { getAuthToken, clearAuthToken } from '@/lib/frontend/auth'
import { useFetch } from '@/lib/frontend/useFetch'

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
  const { fetchWithAuth } = useFetch()

  const fetchUserData = useCallback(async () => {
    try {
      setError(null)

      // 检查是否在客户端环境
      if (typeof window === 'undefined') {
        return
      }

      const { res: response, json: data } = await fetchWithAuth('/api/users/me')

      if (response.ok) {
        setUser(data.user)
      } else if (response.status === 401) {
        setError('\u767b\\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55')
        // clear in-memory token and navigate to login
        clearAuthToken()
        window.location.href = '/'
      } else {
        setError('\u83b7\u53d6\u7528\u6237\u4fe1\u606f\u5931\u8d25')
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
      setError('\u7f51\u7edc\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    if (initialUser) {
      // if parent provided the user, skip fetching
      setLoading(false)
      return
    }

    fetchUserData()
  }, [initialUser, fetchUserData])

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
