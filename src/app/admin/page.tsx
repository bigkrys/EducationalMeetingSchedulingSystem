'use client'

export const dynamic = 'force-dynamic'

import React, { useCallback, useEffect, useState } from 'react'
import { Card, Typography, Row, Col, Statistic, Badge, Alert, Spin, Space } from 'antd'
import { useRouter } from 'next/navigation'
import { BarChartOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { clearUserCache } from '@/lib/api/user-service'
import { useFetch } from '@/lib/frontend/useFetch'
import { clearAuthToken } from '@/lib/frontend/auth'
import { clearStoredTokens } from '@/lib/api/auth'

const { Title, Text } = Typography

interface DashboardStats {
  totalUsers: number
  totalStudents: number
  totalTeachers: number
  totalAppointments: number
  pendingApprovals: number
  expiredAppointments: number
}

type Health = 'healthy' | 'warning' | 'error'

interface DashboardData {
  stats: DashboardStats
  systemHealth: {
    database: Health
    cache: Health
    queue: Health
  }
}

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [forceReset, setForceReset] = useState(false)
  const { fetchWithAuth } = useFetch()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null)
        const { res, json } = await fetchWithAuth('/api/admin/dashboard')
        if (!res.ok) {
          throw new Error('加载数据失败')
        }
        setData(json)
      } catch (e) {
        setError((e as Error).message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [fetchWithAuth])

  const logout = useCallback(async () => {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      console.error(e)
    }
    try {
      clearUserCache()
    } catch (_) {}
    try {
      clearAuthToken()
    } catch (_) {}
    try {
      clearStoredTokens()
    } catch (_) {}
    router.push('/')
  }, [router, fetchWithAuth])

  const healthStatus = (h: Health) => {
    const status = h === 'healthy' ? 'success' : h === 'warning' ? 'warning' : 'error'
    const text = h === 'healthy' ? '正常' : h === 'warning' ? '警告' : '错误'
    return <Badge status={status as any} text={text} />
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert message="错误" description={error} type="error" showIcon />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 22px)' }}>
            管理员控制台
          </Title>
        </div>

        {/* 关键指标 */}
        {data && (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic
                  title="用户总数"
                  value={data.stats.totalUsers}
                  prefix={<UserOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic
                  title="学生人数"
                  value={data.stats.totalStudents}
                  prefix={<UserOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic
                  title="教师人数"
                  value={data.stats.totalTeachers}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic
                  title="预约总数"
                  value={data.stats.totalAppointments}
                  prefix={<BarChartOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic title="待审批" value={data.stats.pendingApprovals} />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card>
                <Statistic title="已过期" value={data.stats.expiredAppointments} />
              </Card>
            </Col>
          </Row>
        )}

        {/* 系统健康 */}
        {data && (
          <Card title="系统健康状态">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Space>
                  <Text strong>数据库</Text>
                  {healthStatus(data.systemHealth.database)}
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Space>
                  <Text strong>缓存</Text>
                  {healthStatus(data.systemHealth.cache)}
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Space>
                  <Text strong>队列</Text>
                  {healthStatus(data.systemHealth.queue)}
                </Space>
              </Col>
            </Row>
          </Card>
        )}
      </Space>
    </div>
  )
}
