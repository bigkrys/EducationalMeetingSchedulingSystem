'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Typography, Row, Col, Skeleton, Alert, Space, Tag, Button } from 'antd'
import { ThunderboltOutlined, SmileOutlined, ReloadOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { StudentGuard } from '@/components/shared/AuthGuard'
import { useFetch } from '@/lib/frontend/useFetch'
import { incr } from '@/lib/frontend/metrics'

type TeacherStat = {
  teacherId: string
  teacherName: string
  subjects: string[]
  appointmentsNext7d: number
  waitlistNext7d: number
}

type RadarResponse = {
  generatedAt: string
  hot: TeacherStat[]
  open: TeacherStat[]
}

function TeacherSection({
  title,
  icon,
  color,
  data,
  category,
  onBook,
}: {
  title: string
  icon: React.ReactNode
  color: string
  data: TeacherStat[]
  category: 'hot' | 'open'
  onBook: (teacher: TeacherStat, category: 'hot' | 'open') => void
}) {
  return (
    <Card
      title={
        <Space>
          <span style={{ color }}>{icon}</span>
          <Typography.Text strong>{title}</Typography.Text>
        </Space>
      }
      variant="borderless"
      style={{ height: '100%' }}
      styles={{ body: { padding: 16 } }}
    >
      {data.length === 0 ? (
        <Typography.Text type="secondary">暂无数据，稍后再看看。</Typography.Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {data.map((item) => (
            <Card
              key={item.teacherId}
              size="small"
              hoverable
              variant="outlined"
              styles={{ body: { padding: 12 } }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space align="baseline" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Typography.Text strong>{item.teacherName}</Typography.Text>
                  <Space size={8}>
                    <Tag color="volcano">预约 {item.appointmentsNext7d}</Tag>
                    <Tag color="geekblue">候补 {item.waitlistNext7d}</Tag>
                  </Space>
                </Space>
                <Space size={[4, 4]} wrap>
                  {item.subjects.slice(0, 4).map((subject) => (
                    <Tag key={subject} color="green">
                      {subject}
                    </Tag>
                  ))}
                  {item.subjects.length === 0 && (
                    <Tag color="default" bordered={false}>
                      暂无科目数据
                    </Tag>
                  )}
                </Space>
                <Button type="primary" block size="small" onClick={() => onBook(item, category)}>
                  立即预约
                </Button>
              </Space>
            </Card>
          ))}
        </Space>
      )}
    </Card>
  )
}

export default function TeacherRadarPage() {
  const { fetchWithAuth } = useFetch()
  const router = useRouter()
  const [data, setData] = useState<RadarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { res, json } = await fetchWithAuth('/api/insights/teacher-radar')
      if (!res.ok) {
        throw new Error(json?.message || '获取数据失败')
      }
      setData(json)
      incr('feature.teacher_radar.refresh', 1)
    } catch (err: any) {
      setError(err?.message || '网络错误')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    fetchData().catch(() => {})
    incr('feature.teacher_radar.view', 1)
  }, [fetchData])

  const generatedTime = useMemo(() => {
    if (!data?.generatedAt) return ''
    return dayjs(data.generatedAt).format('YYYY-MM-DD HH:mm')
  }, [data?.generatedAt])

  const handleBook = useCallback(
    (teacher: TeacherStat, category: 'hot' | 'open') => {
      incr('feature.teacher_radar.book', 1, {
        teacherId: teacher.teacherId,
        category,
      })
      router.push(
        `/dashboard/book-appointment?source=radar&teacher=${encodeURIComponent(teacher.teacherId)}`
      )
    },
    [router]
  )

  return (
    <StudentGuard>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            教师雷达 (未来7天)
          </Typography.Title>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData().catch(() => {})}>
            刷新
          </Button>
        </Space>
        {generatedTime && (
          <Typography.Text type="secondary">数据生成时间：{generatedTime}</Typography.Text>
        )}
        {error && <Alert type="error" message={error} showIcon closable />}
        {loading ? (
          <Row gutter={[16, 16]}>
            {[1, 2].map((key) => (
              <Col key={key} xs={24} md={12}>
                <Card styles={{ body: { padding: 16 } }}>
                  <Skeleton active paragraph={{ rows: 4 }} />
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <TeacherSection
                title="最受欢迎的教师"
                icon={<ThunderboltOutlined />}
                color="#f59e0b"
                data={data?.hot || []}
                category="hot"
                onBook={handleBook}
              />
            </Col>
            <Col xs={24} md={12}>
              <TeacherSection
                title="当前最空闲的教师"
                icon={<SmileOutlined />}
                color="#10b981"
                data={data?.open || []}
                category="open"
                onBook={handleBook}
              />
            </Col>
          </Row>
        )}
      </Space>
    </StudentGuard>
  )
}
