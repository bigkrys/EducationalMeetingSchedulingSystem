'use client'

import { useState, useEffect } from 'react'
import { 
  Card, 
  Button, 
  Tag, 
  Typography, 
  Row, 
  Col, 
  Space, 
  Statistic
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

const { Text } = Typography

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

export default function AdminContent() {
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
    return null // 骨架屏由父组件的 Suspense 处理
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="总用户数"
              value={dashboardData?.stats.totalUsers || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="学生总数"
              value={dashboardData?.stats.totalStudents || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="教师总数"
              value={dashboardData?.stats.totalTeachers || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="总预约数"
              value={dashboardData?.stats.totalAppointments || 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="待审批"
              value={dashboardData?.stats.pendingApprovals || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Card>
            <Statistic
              title="已过期"
              value={dashboardData?.stats.expiredAppointments || 0}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 系统健康状态和快速操作 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                系统健康状态
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>数据库</Text>
                <Space>
                  {getHealthIcon(dashboardData?.systemHealth.database || 'warning')}
                  <Tag color={getHealthColor(dashboardData?.systemHealth.database || 'warning')}>
                    {getHealthText(dashboardData?.systemHealth.database || 'warning')}
                  </Tag>
                </Space>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>缓存</Text>
                <Space>
                  {getHealthIcon(dashboardData?.systemHealth.cache || 'warning')}
                  <Tag color={getHealthColor(dashboardData?.systemHealth.cache || 'warning')}>
                    {getHealthText(dashboardData?.systemHealth.cache || 'warning')}
                  </Tag>
                </Space>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>队列</Text>
                <Space>
                  {getHealthIcon(dashboardData?.systemHealth.queue || 'warning')}
                  <Tag color={getHealthColor(dashboardData?.systemHealth.queue || 'warning')}>
                    {getHealthText(dashboardData?.systemHealth.queue || 'warning')}
                  </Tag>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <SettingOutlined />
                快速操作
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Button block style={{ textAlign: 'left' }}>
                <UserOutlined style={{ marginRight: '8px' }} />
                管理用户
              </Button>
              <Button block style={{ textAlign: 'left' }}>
                <FileTextOutlined style={{ marginRight: '8px' }} />
                管理科目
              </Button>
              <Button block style={{ textAlign: 'left' }}>
                <SettingOutlined style={{ marginRight: '8px' }} />
                管理策略
              </Button>
              <Button block style={{ textAlign: 'left' }}>
                <BarChartOutlined style={{ marginRight: '8px' }} />
                查看审计日志
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 系统任务 */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            系统任务
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                过期待审批
              </Text>
              <Button size="small" type="primary">
                立即执行
              </Button>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                重置配额
              </Text>
              <Button size="small" type="primary">
                立即执行
              </Button>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                发送提醒
              </Text>
              <Button size="small" type="primary">
                立即执行
              </Button>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}
