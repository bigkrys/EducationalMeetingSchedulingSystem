import React, { useState } from 'react'
import { Card, Button, TimePicker, Select, Space, message, Divider, Tag, Alert, Modal } from 'antd'
import { showApiError } from '@/lib/api/global-error-handler'
import { PlusOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { 
  createUtcDateTime,
  getUserTimezone,
  getTimezoneInfo
} from '@/lib/utils/timezone-client'

dayjs.extend(utc)
dayjs.extend(timezone)

interface TimeSlot {
  id: string
  startTime?: dayjs.Dayjs
  endTime?: dayjs.Dayjs
}

interface AvailabilityData {
  dayOfWeek: number
  timeSlots: TimeSlot[]
  isRecurring: boolean
}

interface TimezoneAwareAvailabilityProps {
  teacherId: string
  onSuccess?: () => void
  initialData?: any[]
}

export default function TimezoneAwareAvailability({ 
  teacherId, 
  onSuccess,
  initialData = []
}: TimezoneAwareAvailabilityProps) {
  const [loading, setLoading] = useState(false)
  const [conflictsVisible, setConflictsVisible] = useState(false)
  const [conflicts, setConflicts] = useState<any[]>([])
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData>({
    dayOfWeek: 1, // 默认周一
    timeSlots: [{ id: `slot_${Date.now()}` }],
    isRecurring: true
  })
  
  const timezoneInfo = getTimezoneInfo()

  // 日期选项
  const dayOptions = [
    { value: 1, label: '周一' },
    { value: 2, label: '周二' },
    { value: 3, label: '周三' },
    { value: 4, label: '周四' },
    { value: 5, label: '周五' },
    { value: 6, label: '周六' },
    { value: 0, label: '周日' }
  ]

  // 添加时间段
  const handleAddTimeSlot = () => {
    setAvailabilityData(prev => ({
      ...prev,
      timeSlots: [...prev.timeSlots, { id: `slot_${Date.now()}` }]
    }))
  }

  // 删除时间段
  const handleRemoveTimeSlot = (id: string) => {
    if (availabilityData.timeSlots.length > 1) {
      setAvailabilityData(prev => ({
        ...prev,
        timeSlots: prev.timeSlots.filter(slot => slot.id !== id)
      }))
    }
  }

  // 修改时间段
  const handleTimeSlotChange = (id: string, field: 'startTime' | 'endTime', value: dayjs.Dayjs | null) => {
    setAvailabilityData(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.map(slot =>
        slot.id === id ? { ...slot, [field]: value } : slot
      )
    }))
  }

  // 便捷：为时间段一键设置时长
  const quickSetDuration = (id: string, minutes: number) => {
    setAvailabilityData(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.map(slot => {
        if (slot.id !== id) return slot
        if (!slot.startTime) return slot
        const end = slot.startTime.add(minutes, 'minute')
        return { ...slot, endTime: end }
      })
    }))
  }

  // 显示提交给服务器的 UTC 预览
  const renderUtcPreview = (slot: TimeSlot) => {
    if (!slot.startTime || !slot.endTime) return null
    const startLocal = slot.startTime.format('HH:mm')
    const endLocal = slot.endTime.format('HH:mm')
    const startUtc = createUtcDateTime(startLocal)
    const endUtc = createUtcDateTime(endLocal)
    const startUtcStr = new Date(startUtc).toISOString().slice(11, 16)
    const endUtcStr = new Date(endUtc).toISOString().slice(11, 16)
    return <Tag color="geekblue">UTC: {startUtcStr} - {endUtcStr}</Tag>
  }

  // 提交数据
  const handleSubmit = async () => {
    try {
      setLoading(true)

      // 验证时间段
      const validTimeSlots = availabilityData.timeSlots.filter(slot =>
        slot.startTime && slot.endTime
      )

      if (validTimeSlots.length === 0) {
        message.error('请至少设置一个有效的时间段')
        return
      }

      // 验证时间逻辑
      for (const slot of validTimeSlots) {
        if (!slot.startTime || !slot.endTime) continue
        
        if (slot.startTime >= slot.endTime) {
          message.error('结束时间必须晚于开始时间')
          return
        }

        const duration = slot.endTime.diff(slot.startTime, 'minute')
        if (duration < 15) {
          message.error('时间段不能少于15分钟')
          return
        }
        if (duration > 480) {
          message.error('时间段不能超过8小时')
          return
        }
      }

      // 准备提交数据 - 转换为服务器期望的格式
      const submitData = {
        dayOfWeek: availabilityData.dayOfWeek,
        timeSlots: validTimeSlots.map(slot => ({
          startTime: slot.startTime!.format('HH:mm'), // 保持本地时间格式
          endTime: slot.endTime!.format('HH:mm'),
          isRecurring: availabilityData.isRecurring,
          timezone: getUserTimezone() // 传递用户时区信息
        })),
        action: 'replace',
        timezone: getUserTimezone()
      }

      // console.debug('提交的可用性数据:', submitData)

      const token = localStorage.getItem('accessToken')
      const response = await fetch(`/api/teachers/${teacherId}/availability-utc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submitData)
      })

      if (response.ok) {
        const result = await response.json()
        message.success('可用时间设置成功')
        
        // 显示设置的时间信息
        const dayName = dayOptions.find(d => d.value === availabilityData.dayOfWeek)?.label
        console.log(`已设置 ${dayName} 的可用时间:`)
        validTimeSlots.forEach((slot, index) => {
          console.log(`时间段 ${index + 1}: ${slot.startTime!.format('HH:mm')} - ${slot.endTime!.format('HH:mm')} (本地时间)`)
        })
        
        onSuccess?.()
      } else {
        const error = await response.json()
        if (response.status === 409) {
          setConflicts(Array.isArray(error?.conflicts) ? error.conflicts : [])
          setConflictsVisible(true)
          showApiError({ code: error?.code ?? error?.error, message: error?.message })
        } else {
          showApiError({ code: error?.code ?? error?.error, message: error?.message })
        }
      }

    } catch (error) {
      console.error('设置可用时间失败:', error)
      message.error('设置失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      title="设置可用时间"
      extra={
        <Space>
          <Tag icon={<ClockCircleOutlined />} color="blue">
            {timezoneInfo.name} ({timezoneInfo.offset})
          </Tag>
        </Space>
      }
    >
      <Alert
        message="时区说明"
        description={
          <div>
            <p>• 所有时间都基于您的本地时区 ({timezoneInfo.timezone}) 设置</p>
            <p>• 学生查看时会自动转换为他们的本地时间显示</p>
            <p>• 系统会自动处理时区转换，确保预约时间准确</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 星期选择 */}
        <div>
          <label style={{ marginRight: 8, fontWeight: 'bold' }}>选择星期:</label>
          <Select
            value={availabilityData.dayOfWeek}
            onChange={(value) => setAvailabilityData(prev => ({ ...prev, dayOfWeek: value }))}
            style={{ width: 120 }}
            options={dayOptions}
          />
        </div>

        {/* 时间段设置 */}
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>时间段设置:</span>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAddTimeSlot}
            >
              添加时间段
            </Button>
          </div>

          <Space direction="vertical" style={{ width: '100%' }}>
            {availabilityData.timeSlots.map((slot, index) => (
              <Card key={slot.id} size="small" style={{ backgroundColor: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ minWidth: 80, fontSize: 14, fontWeight: 500 }}>
                    时间段 {index + 1}:
                  </span>
                  
                  <TimePicker
                    format="HH:mm"
                    placeholder="开始时间"
                    value={slot.startTime}
                    onChange={(time) => handleTimeSlotChange(slot.id, 'startTime', time)}
                    style={{ width: 120 }}
                  />
                  
                  <span style={{ color: '#666' }}>至</span>
                  
                  <TimePicker
                    format="HH:mm"
                    placeholder="结束时间"
                    value={slot.endTime}
                    onChange={(time) => handleTimeSlotChange(slot.id, 'endTime', time)}
                    style={{ width: 120 }}
                  />

                  {/* 快捷设置与时长 */}
                  <Space size={6}>
                    <Button size="small" onClick={() => quickSetDuration(slot.id, 30)}>＋30分</Button>
                    <Button size="small" onClick={() => quickSetDuration(slot.id, 60)}>＋60分</Button>
                  </Space>

                  {/* 显示时长 */}
                  {slot.startTime && slot.endTime && (
                    <Tag color="green">
                      时长: {slot.endTime.diff(slot.startTime, 'minute')}分钟
                    </Tag>
                  )}

                  {renderUtcPreview(slot)}

                  {availabilityData.timeSlots.length > 1 && (
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveTimeSlot(slot.id)}
                    />
                  )}
                </div>
              </Card>
            ))}
          </Space>
        </div>

        <Divider />

        {/* 提交按钮 */}
        <div style={{ textAlign: 'center' }}>
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={handleSubmit}
            disabled={availabilityData.timeSlots.every(slot => !slot.startTime || !slot.endTime)}
          >
            保存可用时间
          </Button>
        </div>
      </Space>
      <Modal
        title="时间冲突详情"
        open={conflictsVisible}
        onCancel={() => setConflictsVisible(false)}
        onOk={() => setConflictsVisible(false)}
      >
        {Array.isArray(conflicts) && conflicts.length > 0 ? (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {conflicts.map((c: any, idx: number) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <Tag color="red" style={{ marginBottom: 6 }}>{c.type || 'conflict'}</Tag>
                <div style={{ color: '#444' }}>{c.message || '存在时间冲突'}</div>
                {c.existingSlot && (
                  <div style={{ color: '#666', fontSize: 12 }}>
                    现有：{c.existingSlot.startTime}-{c.existingSlot.endTime}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>存在时间冲突，请调整后重试。</div>
        )}
      </Modal>
    </Card>
  )
}
