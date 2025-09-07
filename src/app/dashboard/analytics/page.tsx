'use client'

export const dynamic = 'force-dynamic'

import React, { useCallback, useEffect, useState } from 'react'
import { Card, Typography, Row, Col, Statistic, Space, Segmented, Table, message } from 'antd'
import Link from 'next/link'
import dynamic from 'next/dynamic'
const Pie = dynamic(() => import('@/components/charts/Pie'), {
  ssr: false,
  loading: () => null,
})
import * as Sentry from '@sentry/nextjs'
import { incr } from '@/lib/frontend/metrics'

const { Title, Text } = Typography

export default function TeacherAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  const fetchData = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
    if (!token) return message.error('未登录')
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher/analytics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('加载失败')
      const json = await res.json()
      setData(json)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    fetchData().finally(() => {
      try {
        const t1 = typeof performance !== 'undefined' ? performance.now() : 0
        Sentry.metrics.distribution('analytics_load_ms', Math.max(0, t1 - t0))
        incr('biz.page.view', 1, { page: 'analytics' })
      } catch {}
    })
  }, [fetchData])

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0 }}>
            我的教学统计
          </Title>
          <Segmented
            value={days}
            onChange={(v) => setDays(v as number)}
            options={[
              { label: '7天', value: 7 },
              { label: '30天', value: 30 },
              { label: '90天', value: 90 },
            ]}
          />
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12} lg={6}>
            <Card loading={loading}>
              <Statistic title="总预约" value={data?.totals?.total || 0} />
            </Card>
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Card loading={loading}>
              <Statistic
                title="审批率"
                value={Math.round((data?.approvalRate || 0) * 100)}
                suffix="%"
              />
            </Card>
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Card loading={loading}>
              <Statistic
                title="未出席率"
                value={Math.round((data?.noShowRate || 0) * 100)}
                suffix="%"
              />
            </Card>
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Card loading={loading}>
              <Statistic title="平均审批时长" value={data?.avgApprovalMinutes || 0} suffix="分钟" />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title="状态分布" loading={loading}>
              {data && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Pie
                    data={[
                      { label: 'pending', value: data.totals?.pending || 0, color: '#d9d9d9' },
                      { label: 'approved', value: data.totals?.approved || 0, color: '#52c41a' },
                      { label: 'rejected', value: data.totals?.rejected || 0, color: '#ff4d4f' },
                      { label: 'completed', value: data.totals?.completed || 0, color: '#1677ff' },
                      { label: 'cancelled', value: data.totals?.cancelled || 0, color: '#fa8c16' },
                      { label: 'no_show', value: data.totals?.no_show || 0, color: '#eb2f96' },
                      { label: 'expired', value: data.totals?.expired || 0, color: '#fa541c' },
                    ]}
                    size={220}
                  />
                  <div>
                    {[
                      ['pending', '#d9d9d9'],
                      ['approved', '#52c41a'],
                      ['rejected', '#ff4d4f'],
                      ['completed', '#1677ff'],
                      ['cancelled', '#fa8c16'],
                      ['no_show', '#eb2f96'],
                      ['expired', '#fa541c'],
                    ].map(([k, c]: any) => (
                      <div
                        key={k}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: c,
                            borderRadius: 2,
                            display: 'inline-block',
                          }}
                        />
                        <Text style={{ width: 90 }}>{k}</Text>
                        <Text type="secondary">{data.totals?.[k] || 0}</Text>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="学生（按总量）" loading={loading}>
              <Table
                size="small"
                rowKey="studentId"
                pagination={{ pageSize: 5 }}
                scroll={{ x: true }}
                dataSource={data?.studentAgg || []}
                columns={
                  [
                    { title: '学生', dataIndex: 'studentName' },
                    { title: '总预约', dataIndex: 'total' },
                    { title: '已审批', dataIndex: 'approved' },
                    { title: '完成', dataIndex: 'completed' },
                    { title: '未出席', dataIndex: 'no_show' },
                  ] as any
                }
              />
            </Card>
          </Col>
        </Row>

        <div className="text-center">
          <Link href="/dashboard">
            <Typography.Link>返回控制台</Typography.Link>
          </Link>
        </div>
      </Space>
    </div>
  )
}
