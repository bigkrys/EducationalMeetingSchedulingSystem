import React, { useState, useEffect, useCallback } from 'react'
import { Card, List, Button, Tag, Alert, Space } from 'antd'
import { ClockCircleOutlined, CalendarOutlined } from '@ant-design/icons'
import { TimeSlotDisplay, AppointmentTimeDisplay } from '@/components/shared/TimezoneDisplay'
import { getTimezoneInfo } from '@/lib/utils/timezone-client'
import { useFetch } from '@/lib/frontend/useFetch'

interface TimeSlot {
  id: string
  startTime: string
  endTime: string
  status: 'available' | 'occupied'
}

interface TimezoneAwareBookingProps {
  teacherId: string
  selectedDate: string
  onSlotSelect?: (startTime: string) => void
}

/**
 * 时区感知的预约时间选择组件
 * 演示如何正确显示和处理时区转换
 */
export default function TimezoneAwareBooking({
  teacherId,
  selectedDate,
  onSlotSelect,
}: TimezoneAwareBookingProps) {
  const { fetchWithAuth } = useFetch()
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectingSlot, setSelectingSlot] = useState(false)

  const timezoneInfo = getTimezoneInfo()

  const fetchTimeSlots = useCallback(async () => {
    try {
      setLoading(true)

      const { res: response, json: data } = await fetchWithAuth(
        `/api/slots?teacherId=${teacherId}&date=${selectedDate}&duration=30`
      )

      if (response.ok) {
        // data is parsed json
        const slots: TimeSlot[] = data.slots.map((utcTimeString: string, index: number) => {
          const startTime = new Date(utcTimeString)
          const endTime = new Date(startTime.getTime() + 30 * 60 * 1000)

          return {
            id: `slot_${index}`,
            startTime: startTime.toISOString(), // 保持UTC格式
            endTime: endTime.toISOString(),
            status: 'available',
          }
        })

        setTimeSlots(slots)
      }
    } catch (error) {
      console.error('获取时间槽失败:', error)
    } finally {
      setLoading(false)
    }
  }, [teacherId, selectedDate, fetchWithAuth])

  useEffect(() => {
    if (teacherId && selectedDate) {
      fetchTimeSlots()
    }
  }, [teacherId, selectedDate, fetchTimeSlots])

  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.status === 'available') {
      if (selectingSlot) return
      try {
        setSelectingSlot(true)
        onSlotSelect?.(slot.startTime)
      } finally {
        setSelectingSlot(false)
      }
    }
  }

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined />
          可预约时间
          <Tag color="blue" icon={<ClockCircleOutlined />}>
            {timezoneInfo.name} ({timezoneInfo.offset})
          </Tag>
        </Space>
      }
      loading={loading}
    >
      <Alert
        message="时区说明"
        description={`所有时间均已转换为您的本地时区 (${timezoneInfo.timezone}) 显示。点击时间段即可预约。`}
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <List
        dataSource={timeSlots}
        renderItem={(slot) => (
          <List.Item>
            <Button
              type={slot.status === 'available' ? 'default' : 'text'}
              disabled={slot.status !== 'available' || selectingSlot}
              onClick={() => handleSlotClick(slot)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: slot.status === 'available' ? '1px solid #d9d9d9' : 'none',
              }}
            >
              <TimeSlotDisplay
                startTime={slot.startTime}
                endTime={slot.endTime}
                showDuration={true}
              />
              {slot.status !== 'available' && (
                <Tag color="red" style={{ float: 'right' }}>
                  已占用
                </Tag>
              )}
            </Button>
          </List.Item>
        )}
        locale={{ emptyText: '该日期暂无可预约时间' }}
      />

      {timeSlots.length > 0 && (
        <div style={{ marginTop: 16, fontSize: '12px', color: '#666' }}>
          <div>• 显示时间：本地时间 ({timezoneInfo.timezone})</div>
          <div>• 每个时间段固定30分钟</div>
          <div>• 点击可预约的时间段进行预约</div>
        </div>
      )}
    </Card>
  )
}

/**
 * 预约历史展示组件
 * 演示如何显示已有预约的时间信息
 */
export function AppointmentHistory({ appointments }: { appointments: any[] }) {
  const timezoneInfo = getTimezoneInfo()

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined />
          我的预约
          <Tag color="blue" icon={<ClockCircleOutlined />}>
            {timezoneInfo.name}
          </Tag>
        </Space>
      }
    >
      <List
        dataSource={appointments}
        renderItem={(appointment) => (
          <List.Item>
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>
                <strong>{appointment.teacher?.user?.name || '未知教师'}</strong>
                <Tag style={{ marginLeft: 8 }}>
                  {appointment.subject?.name || appointment.subject}
                </Tag>
              </div>

              <AppointmentTimeDisplay
                scheduledTime={appointment.scheduledTime}
                durationMinutes={appointment.durationMinutes}
                status={appointment.status}
              />

              {appointment.studentNotes && (
                <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                  备注: {appointment.studentNotes}
                </div>
              )}
            </div>
          </List.Item>
        )}
        locale={{ emptyText: '暂无预约记录' }}
      />
    </Card>
  )
}
