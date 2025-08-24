'use client'

// 强制动态渲染，避免预渲染问题
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { AdminGuard } from '@/components/shared/AuthGuard'
import { 
  Card, 
  Button, 
  Tag, 
  Typography, 
  Row, 
  Col, 
  Space, 
  Spin,
  Statistic,
  Divider
} from 'antd'
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

const { Title, Text } = Typography

interface AdminDashboardData {
  stats: {
    totalUsers: number
    totalStudents: number
    totalTeachers: number
    totalAppointments: number
    pendingApprovals: number
    expiredAppointments: number
  }
  systemHealth: {
    database: 'healthy' | 'warning' | 'error'
    cache: 'healthy' | 'warning' | 'error'
    queue: 'healthy' | 'warning' | 'error'
  }
}

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      if (response.ok) {
        const data = await response.json()
        setDashboardData(data)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'warning':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      default:
        return <ExclamationCircleOutlined style={{ color: '#8c8c8c' }} />
    }
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'error'
      default:
        return 'default'
    }
  }

  const getHealthText = (status: string) => {
    switch (status) {
      case 'healthy':
        return '健康'
      case 'warning':
        return '警告'
      case 'error':
        return '错误'
      default:
        return '未知'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <AdminGuard>
      <div className="container mx-auto px-4 py-8">
      {/* 顶部标题 */}
      <div className="mb-8">
        <Title level={2}>
          <BarChartOutlined className="mr-3" />
          管理员仪表板
        </Title>
        <Text type="secondary">
          系统概览和管理工具
        </Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} className="mb-8">
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={dashboardData?.stats.totalUsers || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="学生数量"
              value={dashboardData?.stats.totalStudents || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="教师数量"
              value={dashboardData?.stats.totalTeachers || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总预约数"
              value={dashboardData?.stats.totalAppointments || 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 重要指标 */}
      <Row gutter={[16, 16]} className="mb-8">
        <Col xs={24} md={12}>
          <Card 
            title="待处理事项" 
            extra={<ClockCircleOutlined />}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="待审批预约"
                  value={dashboardData?.stats.pendingApprovals || 0}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="过期预约"
                  value={dashboardData?.stats.expiredAppointments || 0}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        
        <Col xs={24} md={12}>
          <Card 
            title="系统健康状态" 
            extra={<SettingOutlined />}
          >
            <Space direction="vertical" className="w-full">
              <div className="flex justify-between items-center">
                <span>数据库</span>
                <div>
                  {getHealthIcon(dashboardData?.systemHealth.database || 'healthy')}
                  <Tag 
                    color={getHealthColor(dashboardData?.systemHealth.database || 'healthy')}
                    className="ml-2"
                  >
                    {getHealthText(dashboardData?.systemHealth.database || 'healthy')}
                  </Tag>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>缓存</span>
                <div>
                  {getHealthIcon(dashboardData?.systemHealth.cache || 'healthy')}
                  <Tag 
                    color={getHealthColor(dashboardData?.systemHealth.cache || 'healthy')}
                    className="ml-2"
                  >
                    {getHealthText(dashboardData?.systemHealth.cache || 'healthy')}
                  </Tag>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>队列</span>
                <div>
                  {getHealthIcon(dashboardData?.systemHealth.queue || 'healthy')}
                  <Tag 
                    color={getHealthColor(dashboardData?.systemHealth.queue || 'healthy')}
                    className="ml-2"
                  >
                    {getHealthText(dashboardData?.systemHealth.queue || 'healthy')}
                  </Tag>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 快速操作 */}
      <Card title="快速操作" extra={<SettingOutlined />}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Card 
              type="inner"
              title="用户管理"
              extra={<UserOutlined />}
            >
              <p>查看和管理系统用户</p>
              <Button type="primary" href="/admin/users" className="mt-3">
                管理用户
              </Button>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={8}>
            <Card 
              type="inner"
              title="审计日志"
              extra={<FileTextOutlined />}
            >
              <p>查看系统操作记录</p>
              <Button type="primary" href="/admin/audit-logs" className="mt-3">
                查看日志
              </Button>
            </Card>
          </Col>
          
          <Col xs={24} sm={12} md={8}>
            <Card 
              type="inner"
              title="系统作业"
              extra={<ClockCircleOutlined />}
            >
              <p>执行系统维护任务</p>
              <Button type="primary" onClick={() => {
                // 执行过期预约清理
                fetch('/api/jobs/expire-pending', { method: 'POST' })
                  .then(() => alert('过期预约清理任务已启动'))
                  .catch(() => alert('任务执行失败'))
              }} className="mt-3">
                立即执行
              </Button>
            </Card>
          </Col>
        </Row>
        </Card>
      </div>
    </AdminGuard>
  )
}