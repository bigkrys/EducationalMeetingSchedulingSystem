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
  CloseCircleOutlined
} from '@ant-design/icons'

interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin'
  serviceLevel?: 'level1' | 'level2' | 'premium'
  monthlyMeetingsUsed?: number
  enrolledSubjects?: string[]
  subjects?: string[]
  maxDailyMeetings?: number
  bufferMinutes?: number
}

export default function DashboardContent() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUserData()
  }, [])

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
          'Authorization': `Bearer ${token}`
        }
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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '50vh' 
      }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '50vh' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>用户未找到</h1>
          <p style={{ color: '#666' }}>请先登录</p>
          <Button type="primary" onClick={() => window.location.href = '/'}>
            返回登录
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
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
        <Row gutter={[16, 16]}>
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
                user.role === 'student' ? '学生' :
                user.role === 'teacher' ? '教师' : '管理员'
              }
            />
          </Col>
          
          {user.role === 'student' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="服务级别" 
                  value={
                    user.serviceLevel === 'level1' ? '一级' :
                    user.serviceLevel === 'level2' ? '二级' : '高级'
                  }
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="本月已使用次数" 
                  value={user.monthlyMeetingsUsed || 0} 
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="已注册科目" 
                  value={user.enrolledSubjects?.join(', ') || '无'} 
                />
              </Col>
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="教授科目" 
                  value={user.subjects?.join(', ') || '无'} 
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="每日最大预约数" 
                  value={user.maxDailyMeetings || 0} 
                />
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Statistic 
                  title="缓冲时间（分钟）" 
                  value={user.bufferMinutes || 0} 
                />
              </Col>
            </>
          )}
        </Row>
      </Card>

      {/* 功能菜单 */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>功能菜单</h2>
        <Row gutter={[16, 16]}>
          {user.role === 'student' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Link href="/dashboard/book-appointment">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <CalendarOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        预约会议
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        查看教师可用时间并预约会议
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>

              <Col xs={24} md={12} lg={8}>
                <Link href="/dashboard/my-appointments">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <FileTextOutlined style={{ fontSize: '48px', color: '#52c41a', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        我的预约
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        查看和管理您的所有预约
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>

              <Col xs={24} md={12} lg={8}>
                <Link href="/dashboard/waitlist">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <ClockCircleOutlined style={{ fontSize: '48px', color: '#fa8c16', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        候补队列
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        加入热门时段的候补队列
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Link href="/dashboard/availability">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <SettingOutlined style={{ fontSize: '48px', color: '#722ed1', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        设置可用性
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        设置您的每周可用时间
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>

              <Col xs={24} md={12} lg={8}>
                <Link href="/dashboard/appointments">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <BarChartOutlined style={{ fontSize: '48px', color: '#13c2c2', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        预约管理
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        查看和审批学生预约
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>
            </>
          )}

          {user.role === 'admin' && (
            <>
              <Col xs={24} md={12} lg={8}>
                <Link href="/admin/policies">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <SettingOutlined style={{ fontSize: '48px', color: '#f5222d', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        服务策略
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        管理系统服务级别策略
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>

              <Col xs={24} md={12} lg={8}>
                <Link href="/admin">
                  <Card 
                    hoverable
                    className="h-full"
                  >
                    <div style={{ textAlign: 'center' }}>
                      <BarChartOutlined style={{ fontSize: '48px', color: '#2f54eb', marginBottom: '12px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
                        系统任务
                      </h3>
                      <p style={{ fontSize: '14px', color: '#666' }}>
                        执行系统维护任务
                      </p>
                    </div>
                  </Card>
                </Link>
              </Col>
            </>
          )}
        </Row>
      </div>
    </div>
  )
}
