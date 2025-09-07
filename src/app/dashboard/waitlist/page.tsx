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
  Modal,
} from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'

const { Title, Text } = Typography

export default function WaitlistPage() {
  const token = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null),
    []
  )
  const [me, setMe] = useState<any>(null)
  const [teachers, setTeachers] = useState<any[]>([])
  const [myWaitlist, setMyWaitlist] = useState<any[]>([])
  const [teacherId, setTeacherId] = useState<string | undefined>()
  const [date, setDate] = useState<any>(null)
  const [time, setTime] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)
  // teacher view
  const [teacherDate, setTeacherDate] = useState<any>(null)
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [waitlistCountMap, setWaitlistCountMap] = useState<Record<string, number>>({})
  const [wlModal, setWlModal] = useState<{ open: boolean; slot?: string; items?: any[] }>({
    open: false,
  })

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
      setMe(meJson)
      const sid = meJson?.student?.id
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

  // 教师用户默认选中今天，提升可见性
  useEffect(() => {
    if (me?.role === 'teacher' && !teacherDate) {
      setTeacherDate(dayjs())
    }
  }, [me?.role, teacherDate])

  // teacher: load slots with waitlist counts
  const fetchTeacherSlots = async () => {
    try {
      if (!me?.teacher?.id || !teacherDate) return
      const res = await fetch(
        `/api/slots?teacherId=${me.teacher.id}&date=${teacherDate.format('YYYY-MM-DD')}&duration=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      const booked: string[] = Array.isArray(json.bookedSlots) ? json.bookedSlots : []
      const wlArr: Array<{ slot: string; count: number }> = Array.isArray(json.waitlistCount)
        ? json.waitlistCount
        : []
      const wlMap: Record<string, number> = {}
      wlArr.forEach((r) => (wlMap[r.slot] = r.count))
      setBookedSlots(booked)
      setWaitlistCountMap(wlMap)
    } catch {}
  }
  useEffect(() => {
    if (me?.teacher?.id && teacherDate) fetchTeacherSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.teacher?.id, teacherDate])

  const openTeacherSlotWaitlist = async (slotIso: string) => {
    try {
      const res = await fetch(
        `/api/waitlist/slot?teacherId=${me.teacher.id}&slot=${encodeURIComponent(slotIso)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return
      setWlModal({ open: true, slot: slotIso, items: json.waitlist || [] })
    } catch {}
  }

  const clearThisSlotWaitlist = async () => {
    try {
      if (!wlModal.slot || !me?.teacher?.id) return
      const res = await fetch('/api/waitlist/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teacherId: me.teacher.id, slot: wlModal.slot }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return message.error(json?.message || '清空失败')
      message.success(`已清空候补（移除 ${json.removed || 0} 人）`)
      // refresh
      await openTeacherSlotWaitlist(wlModal.slot)
      await fetchTeacherSlots()
    } catch (e) {
      message.error('清空失败')
    }
  }

  const clearSlotDirect = async (slotIso: string) => {
    try {
      if (!me?.teacher?.id) return
      const res = await fetch('/api/waitlist/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teacherId: me.teacher.id, slot: slotIso }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return message.error(json?.message || '清空失败')
      message.success(`已清空候补（移除 ${json.removed || 0} 人）`)
      await fetchTeacherSlots()
    } catch (e) {
      message.error('清空失败')
    }
  }

  const addToWaitlist = async () => {
    try {
      if (!teacherId || !date || !time) return message.error('请选择教师、日期与时间')
      setLoading(true)
      const me = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      const meJson = await me.json()
      const sid = meJson?.student?.id
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
      const pos = typeof json.position === 'number' ? json.position : undefined
      message.success(pos ? `已加入候补（当前排位第 ${pos} 位）` : '已加入候补')
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
      const sid = meJson?.student?.id
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
            候补队列
          </Title>
        </div>

        {me?.role !== 'teacher' && (
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
        )}

        {me?.role !== 'teacher' && (
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
                {
                  title: '时间',
                  dataIndex: 'slot',
                  render: (t: string) => dayjs(t).format('HH:mm'),
                },
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
        )}

        {me?.role === 'teacher' && (
          <Card title="我的时段候补（教师视图）">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}>
                <DatePicker
                  style={{ width: '100%' }}
                  value={teacherDate}
                  onChange={setTeacherDate as any}
                />
              </Col>
            </Row>
            {(() => {
              const waitlistSlots = Object.keys(waitlistCountMap || {})
              const allSlots = Array.from(new Set([...bookedSlots, ...waitlistSlots]))
                .filter(Boolean)
                .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())

              if (allSlots.length === 0) {
                return <div className="mt-4 text-sm text-gray-400">该日期暂无候补队列</div>
              }

              return (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {allSlots.map((iso) => {
                    const cnt = waitlistCountMap[iso] || 0
                    if (cnt <= 0) return null
                    return (
                      <div key={iso} className="flex items-center space-x-2">
                        <Button size="small" onClick={() => openTeacherSlotWaitlist(iso)}>
                          {dayjs(iso).format('HH:mm')} 候补 {cnt}
                        </Button>
                        <Button size="small" danger onClick={() => clearSlotDirect(iso)}>
                          清空
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </Card>
        )}

        <Modal
          title={wlModal.slot ? `候补队列 · ${dayjs(wlModal.slot).format('HH:mm')}` : '候补队列'}
          open={wlModal.open}
          onCancel={() => setWlModal({ open: false })}
          footer={null}
          width={520}
        >
          {me?.role === 'teacher' && wlModal.slot && (
            <div className="mb-2 flex justify-end">
              <Button danger size="small" onClick={clearThisSlotWaitlist}>
                清空此时段候补
              </Button>
            </div>
          )}
          <Table
            size="small"
            rowKey="id"
            dataSource={wlModal.items || []}
            pagination={false}
            columns={[
              { title: '#', render: (_: any, __: any, idx: number) => idx + 1 },
              { title: '学生', dataIndex: 'studentName', render: (v: any) => v || '同学' },
              { title: '优先级', dataIndex: 'priority' },
              {
                title: '加入时间',
                dataIndex: 'createdAt',
                render: (t: string) => dayjs(t).format('MM-DD HH:mm'),
              },
            ]}
          />
        </Modal>
      </Space>
    </div>
  )
}
