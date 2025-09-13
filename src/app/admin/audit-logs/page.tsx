'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import { Card, Typography, Button, Table, Space, Input, DatePicker, Tag, message } from 'antd'
import { useRouter } from 'next/navigation'
import dayjs, { Dayjs } from 'dayjs'
import Link from 'next/link'
import { useFetch } from '@/lib/frontend/useFetch'

const { Title } = Typography
const { RangePicker } = DatePicker

interface LogRow {
  id: string
  actor: string
  action: string
  target: string
  details: string
  ipAddress: string
  userAgent: string
  timestamp: string
}

export default function AdminAuditLogs() {
  const router = useRouter()
  const { fetchWithAuth } = useFetch()
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const fetchLogs = async (params?: {
    page?: number
    limit?: number
    actor?: string
    action?: string
    from?: string
    to?: string
  }) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('page', String(params?.page ?? page))
      qs.set('limit', String(params?.limit ?? limit))
      if (params?.actor ?? actor) qs.set('actor', String(params?.actor ?? actor))
      if (params?.action ?? action) qs.set('action', String(params?.action ?? action))
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      const { res, json } = await fetchWithAuth(`/api/admin/audit-logs?${qs.toString()}`)
      if (!res.ok) throw new Error('\u52a0\u8f7d\u65e5\u5fd7\u5931\u8d25')
      setLogs(json.logs || [])
      setTotal(json.total || 0)
      setPage(json.page || 1)
      setLimit(json.limit || 50)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    { title: '操作者', dataIndex: 'actor', key: 'actor' },
    { title: '动作', dataIndex: 'action', key: 'action', render: (a: string) => <Tag>{a}</Tag> },
    { title: '目标ID', dataIndex: 'target', key: 'target' },
    { title: '详情', dataIndex: 'details', key: 'details', ellipsis: true },
    { title: 'IP', dataIndex: 'ipAddress', key: 'ipAddress' },
    { title: 'UA', dataIndex: 'userAgent', key: 'userAgent', ellipsis: true },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0 }}>
            审计日志
          </Title>
        </div>

        <Card>
          <Space wrap style={{ marginBottom: 16 }}>
            <Input.Search
              placeholder="按操作者姓名搜索"
              allowClear
              onSearch={(v) => {
                setActor(v)
                fetchLogs({ page: 1, actor: v })
              }}
              style={{ width: 240 }}
            />
            <Input.Search
              placeholder="按动作搜索，如 LOGIN、POLICIES_UPDATED"
              allowClear
              onSearch={(v) => {
                setAction(v)
                fetchLogs({ page: 1, action: v })
              }}
              style={{ width: 320 }}
            />
            <RangePicker
              showTime
              onChange={(vals) => {
                setRange(vals as any)
              }}
            />
            <Button
              onClick={() => {
                const from = range?.[0]?.toISOString()
                const to = range?.[1]?.toISOString()
                fetchLogs({ page: 1, from, to })
              }}
            >
              应用时间范围
            </Button>
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            dataSource={logs}
            columns={columns as any}
            pagination={{
              current: page,
              pageSize: limit,
              total,
              showSizeChanger: true,
              onChange: (p, ps) => fetchLogs({ page: p, limit: ps }),
            }}
          />
        </Card>
      </Space>

      <div className="text-center mt-6">
        <Button type="primary" onClick={() => router.push('/admin')}>
          返回管理员控制台
        </Button>
      </div>
    </div>
  )
}
