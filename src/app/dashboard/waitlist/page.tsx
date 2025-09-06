'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Typography,
  Space,
  Table,
  Button,
  Select,
  DatePicker,
  TimePicker,
  message,
  Row,
  Col,
} from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'

const { Title, Text } = Typography

export default function WaitlistPage() {
  const token = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null),
    []
  )
  const [teachers, setTeachers] = useState<any[]>([])
  const [myWaitlist, setMyWaitlist] = useState<any[]>([])
  const [teacherId, setTeacherId] = useState<string | undefined>()
  const [date, setDate] = useState<any>(null)
  const [time, setTime] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const fetchTeachers = async () => {
    try {
      const res = await fetch('/api/teachers', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const json = await res.json()
      setTeachers(json.teachers || [])
    } catch {}
  }

  const fetchMyWaitlist = async () => {
    try {
      // 需要 studentId，后端基于传入的 studentId 过滤
      const me = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      const meJson = await me.json()
      const sid = meJson?.user?.student?.id
      if (!sid) return
      const res = await fetch(`/api/waitlist?studentId=${sid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      setMyWaitlist(json.items || [])
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    fetchTeachers()
    fetchMyWaitlist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addToWaitlist = async () => {
    try {
      if (!teacherId || !date || !time) return message.error('请选择教师、日期与时间')
      setLoading(true)
      const me = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      const meJson = await me.json()
      const sid = meJson?.user?.student?.id
      if (!sid) return message.error('仅学生可加入候补')

      const slot = dayjs(date.format('YYYY-MM-DD') + ' ' + time.format('HH:mm')).toISOString()
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teacherId,
          date: date.format('YYYY-MM-DD'),
          slot,
          studentId: sid,
          subject: 'N/A',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || '加入候补失败')
      message.success('已加入候补')
      fetchMyWaitlist()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const removeFromWaitlist = async (row: any) => {
    try {
      setLoading(true)
      const me = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      const meJson = await me.json()
      const sid = meJson?.user?.student?.id
      if (!sid) return
      const res = await fetch('/api/waitlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: row.id, studentId: sid }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || '移除失败')
      message.success('已移除候补')
      fetchMyWaitlist()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0 }}>
            热门时段候补
          </Title>
        </div>

        <Card title="加入候补">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Select
                placeholder="选择教师"
                style={{ width: '100%' }}
                value={teacherId}
                onChange={setTeacherId}
                options={(teachers || []).map((t: any) => ({ value: t.id, label: t.name }))}
              />
            </Col>
            <Col xs={12} md={8}>
              <DatePicker style={{ width: '100%' }} value={date} onChange={setDate as any} />
            </Col>
            <Col xs={12} md={8}>
              <TimePicker
                style={{ width: '100%' }}
                value={time}
                onChange={setTime as any}
                minuteStep={15}
                format="HH:mm"
              />
            </Col>
            <Col xs={24}>
              <Button type="primary" block loading={loading} onClick={addToWaitlist}>
                加入候补
              </Button>
            </Col>
          </Row>
        </Card>

        <Card title="我的候补">
          <Table
            size="small"
            rowKey="id"
            dataSource={myWaitlist}
            scroll={{ x: true }}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: '教师', dataIndex: 'teacherName' },
              { title: '日期', dataIndex: 'date' },
              { title: '时间', dataIndex: 'slot', render: (t: string) => dayjs(t).format('HH:mm') },
              { title: '优先级(推断)', dataIndex: 'priority' },
              {
                title: '操作',
                key: 'actions',
                render: (_: any, r: any) => (
                  <Button size="small" danger onClick={() => removeFromWaitlist(r)}>
                    移除
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  )
}
