'use client'

import React, { useState } from 'react'
import { Modal, Form, Select, TimePicker, Button, Alert, Card, Tag, Switch } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { message } from 'antd'

const { Option } = Select

interface AddAvailabilityModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: any) => void
  form: any
}

interface TimeSlot {
  id: string
  startTime: string
  endTime: string
}

const AddAvailabilityModal: React.FC<AddAvailabilityModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  form
}) => {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([
    { id: '1', startTime: '', endTime: '' }
  ])

  const handleAddTimeSlot = () => {
    const newId = (timeSlots.length + 1).toString()
    setTimeSlots([...timeSlots, { id: newId, startTime: '', endTime: '' }])
  }

  const handleRemoveTimeSlot = (id: string) => {
    if (timeSlots.length > 1) {
      setTimeSlots(timeSlots.filter(slot => slot.id !== id))
    }
  }

  const handleTimeSlotChange = (id: string, field: 'startTime' | 'endTime', value: any) => {
    if (value && typeof value.format === 'function') {
      setTimeSlots(timeSlots.map(slot =>
        slot.id === id ? { ...slot, [field]: value.format('HH:mm') } : slot
      ))
    }
  }

  const handleSubmit = () => {
    form.validateFields().then((values: any) => {
      // 验证时间段数据
      const validTimeSlots = timeSlots.filter(slot =>
        slot.startTime && slot.endTime && slot.startTime.trim() !== '' && slot.endTime.trim() !== ''
      )

      if (validTimeSlots.length === 0) {
        message.error('请至少设置一个有效的时间段')
        return
      }

      // 验证时间逻辑
      for (const slot of validTimeSlots) {
        const start = new Date(`2000-01-01T${slot.startTime}:00`)
        const end = new Date(`2000-01-01T${slot.endTime}:00`)

        if (start >= end) {
          message.error('结束时间必须晚于开始时间')
          return
        }
      }

      const availabilityData = {
        ...values,
        timeSlots: validTimeSlots.map(slot => ({
          startTime: slot.startTime,
          endTime: slot.endTime
        }))
      }

      console.log('提交的可用性数据:', availabilityData)
      console.log('isRecurring 字段值:', values.isRecurring, '类型:', typeof values.isRecurring)

      // 显示确认信息
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const selectedDay = dayNames[values.dayOfWeek]
      const recurringText = values.isRecurring ? '每周重复' : '仅此一次'

      console.log(`准备设置：${selectedDay} ${recurringText}`)
      console.log(`dayOfWeek 值: ${values.dayOfWeek} (${selectedDay})`)
      console.log(`isRecurring 值: ${values.isRecurring}`)
      console.log(`时间段数量：${validTimeSlots.length}`)
      validTimeSlots.forEach((slot, index) => {
        console.log(`时间段 ${index + 1}: ${slot.startTime} - ${slot.endTime}`)
      })

      onSubmit(availabilityData)
    })
  }

  const handleCancel = () => {
    form.resetFields()
    setTimeSlots([{ id: '1', startTime: '', endTime: '' }])
    onCancel()
  }

  return (
    <Modal
      title="添加可用时间"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dayOfWeek: 1,
          isRecurring: true
        }}
      >
        <Form.Item
          name="dayOfWeek"
          label="选择星期"
          rules={[{ required: true, message: '请选择星期' }]}
        >
          <Select placeholder="请选择星期">
            <Option value={0}>周日</Option>
            <Option value={1}>周一</Option>
            <Option value={2}>周二</Option>
            <Option value={3}>周三</Option>
            <Option value={4}>周四</Option>
            <Option value={5}>周五</Option>
            <Option value={6}>周六</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="isRecurring"
          label="重复设置"
        >
          <Switch
            checkedChildren="每周重复"
            unCheckedChildren="仅此一次"
            defaultChecked={true}
          />
        </Form.Item>

        <Form.Item label="时间段设置"
        >
          <Alert 
            message="时间段设置说明" 
            description={
              <div className="text-sm">
                <p>• 时间段重叠检测仅在同一个星期几内进行</p>
                <p>• 不同星期几的相同时间段不会被认为是重叠的</p>
                <p>• 每个时间段最大跨度8小时</p>
                <p>• 建议设置合理的时间段，避免过短或过长</p>
              </div>
            }
            type="info" 
            showIcon
          />
          <div className="space-y-3">
            {timeSlots.map((slot, index) => (
              <Card key={slot.id} size="small">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-700 min-w-[60px]">
                    时间段 {index + 1}
                  </span>


                  <TimePicker
                    format="HH:mm"
                    placeholder="开始时间"
                    onChange={(time) => handleTimeSlotChange(slot.id, 'startTime', time)}
                  />

                  <span className="text-gray-500">至</span>

                  <TimePicker
                    format="HH:mm"
                    placeholder="结束时间"
                    onChange={(time) => handleTimeSlotChange(slot.id, 'endTime', time)}
                  />

                  {timeSlots.length > 1 && (
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

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAddTimeSlot}
              className="w-full"
            >
              添加时间段
            </Button>
          </div>
        </Form.Item>

        <Form.Item className="mb-0">
          <div className="flex justify-end space-x-3">
            <Button onClick={handleCancel}>
              取消
            </Button>
            <Button type="primary" onClick={handleSubmit}>
              确认添加
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default AddAvailabilityModal
