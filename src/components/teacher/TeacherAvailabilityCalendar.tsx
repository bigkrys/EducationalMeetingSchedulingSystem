'use client'

import React, { useState, useEffect } from 'react'
import { Card, Button, Space, message, Modal, Form, Select, DatePicker, Tag, Empty } from 'antd'
import { PlusOutlined, ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api/http-client'

import AddAvailabilityModal from './AddAvailabilityModal'

const { Option } = Select
const { RangePicker } = DatePicker

export interface TeacherAvailabilityData {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface BlockedTimeData {
  id: string
  startTime: string
  endTime: string
  reason?: string
}

interface TeacherAvailabilityCalendarProps {
  teacherId: string
  teacherName: string
  onRefresh?: () => void
}

const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const TeacherAvailabilityCalendar: React.FC<TeacherAvailabilityCalendarProps> = ({
  teacherId,
  teacherName,
  onRefresh
}) => {
  const [availability, setAvailability] = useState<TeacherAvailabilityData[]>([])
  const [blockedTimes, setBlockedTimes] = useState<BlockedTimeData[]>([])
  const [loading, setLoading] = useState(false)
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [isBlockModalVisible, setIsBlockModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [blockForm] = Form.useForm()

  // 获取可用性数据
  const fetchAvailability = React.useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const response = await fetch(`/api/teachers/${teacherId}/availability`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()

        // 处理不同的API返回格式
        let availabilityArray = []
        if (Array.isArray(data)) {
          // 直接返回数组的情况
          availabilityArray = data
        } else if (data && data.availability && Array.isArray(data.availability)) {
          // 返回 {availability: [...], ...} 格式的情况
          availabilityArray = data.availability
        } else {
          console.warn('API返回的可用性数据格式不支持:', data)
          availabilityArray = []
        }
        
        // 确保数据是数组
        if (availabilityArray.length > 0) {
          const availabilityData = availabilityArray.map((item: any) => {
            return {
              id: item.id,
              dayOfWeek: item.dayOfWeek,
              startTime: item.startTime,
              endTime: item.endTime,
              isActive: item.isRecurring === true || item.isActive === true
            }
          })
          setAvailability(availabilityData)
        } else {
          setAvailability([])
        }
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '获取可用性数据失败')
      }
    } catch (error) {
      message.error('获取可用性数据失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  // 获取阻塞时间数据
  const fetchBlockedTimes = React.useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        console.error('未登录')
        return
      }

      const response = await fetch(`/api/blocked-times?teacherId=${teacherId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        
        // 处理不同的API返回格式
        let blockedTimesArray = []
        if (Array.isArray(data)) {
          // 直接返回数组的情况
          blockedTimesArray = data
        } else if (data && data.blockedTimes && Array.isArray(data.blockedTimes)) {
          // 返回 {blockedTimes: [...], ...} 格式的情况
          blockedTimesArray = data.blockedTimes
        } else {
          console.warn('API返回的阻塞时间数据格式不支持:', data)
          blockedTimesArray = []
        }
        
        // 过滤当前教师的阻塞时间
        const teacherBlockedTimes = blockedTimesArray.filter((item: any) => item.teacherId === teacherId)
        setBlockedTimes(teacherBlockedTimes)
      } else {
        const errorData = await response.json()
        console.error('获取阻塞时间失败:', errorData.message)
      }
    } catch (error) {
      console.error('获取阻塞时间失败:', error)
    }
  }, [teacherId])

  useEffect(() => {
    fetchAvailability()
    fetchBlockedTimes()
  }, [fetchAvailability, fetchBlockedTimes])

  // 添加可用性
  const handleAddAvailability = async (values: any) => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }


      // 处理多个时间段
      if (values.timeSlots && Array.isArray(values.timeSlots)) {
        // 批量添加多个时间段
        const promises = values.timeSlots.map(async (slot: any) => {
          if (!slot.startTime || !slot.endTime) {
            throw new Error('时间段数据不完整')
          }

          const availabilityData = {
            teacherId: teacherId,
            dayOfWeek: values.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isRecurring: values.isRecurring
          }

          // 使用新的HTTP客户端，它会自动处理错误
          const response = await api.post(`/api/teachers/${teacherId}/availability`, availabilityData)
          
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.message || '添加可用性失败')
          }

          const result = await response.json()
          // 如果后端返回与 blockedTime 的 warnings，提示用户（但仍视为成功）
          if (result && result.blockedTimeWarnings && Array.isArray(result.blockedTimeWarnings) && result.blockedTimeWarnings.length > 0) {
            message.warning('已创建可用时间，但检测到与阻塞时间的冲突，相关时段将不会对学生显示为可预约。')
          }

          return result
        })

        await Promise.all(promises)
        message.success('可用性设置成功')
        setIsAddModalVisible(false)
        form.resetFields()
        fetchAvailability()
        onRefresh?.()
      } else {
        message.error('时间段数据格式错误')
      }
    } catch (error) {
      console.error('添加可用性错误:', error)
      message.error(error instanceof Error ? error.message : '添加可用性失败')
    }
  }

  // 删除可用性
  const handleDeleteAvailability = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const response = await fetch(`/api/teachers/${teacherId}/availability/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        message.success('可用性已删除')
        fetchAvailability()
        onRefresh?.()
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 添加阻塞时间
  const handleAddBlockedTime = async (values: any) => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const [startTime, endTime] = values.timeRange
      const blockedTimeData = {
        teacherId: teacherId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        reason: values.reason
      }

      const response = await fetch('/api/blocked-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(blockedTimeData)
      })

      if (response.ok) {
        const result = await response.json()
        // 如果后端返回 availabilityConflicts，提示用户但仍认为创建成功
        if (result && result.availabilityConflicts && Array.isArray(result.availabilityConflicts) && result.availabilityConflicts.length > 0) {
          Modal.info({
            title: '已添加阻塞时间（存在与可用时间的冲突）',
            content: (
              <div>
                <p>阻塞时间已创建，但与下列每周可用时间存在冲突：</p>
                <ul>
                  {result.availabilityConflicts.map((c: any) => (
                    <li key={c.id}>{`周${c.dayOfWeek} ${c.startTime}-${c.endTime}`}</li>
                  ))}
                </ul>
                <p>这些可用时间段在学生查询/创建预约时会被过滤。</p>
              </div>
            ),
            onOk() {}
          })
        } else {
          message.success('阻塞时间已添加')
        }

        setIsBlockModalVisible(false)
        blockForm.resetFields()
        fetchBlockedTimes()
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '添加阻塞时间失败')
      }
    } catch (error) {
      message.error('添加阻塞时间失败')
    }
  }

  // 删除阻塞时间
  const handleDeleteBlockedTime = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const response = await fetch(`/api/blocked-times/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        message.success('阻塞时间已删除')
        fetchBlockedTimes()
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 按星期分组可用性
  const groupedAvailability = Array.isArray(availability) 
    ? availability.reduce((groups, item) => {
        const day = item.dayOfWeek
        if (!groups[day]) {
          groups[day] = []
        }
        groups[day].push(item)
        return groups
      }, {} as Record<number, TeacherAvailabilityData[]>)
    : {}

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          {teacherName} 的可用性设置
        </h3>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsAddModalVisible(true)}
          >
            添加可用时间
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            onClick={() => setIsBlockModalVisible(true)}
          >
            添加阻塞时间
          </Button>
        </Space>
      </div>

      {/* 每周可用性 */}
      <Card title="每周可用性" className="mb-6">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">📅 可用性设置说明：</p>
            <p>• 时间段重叠检测仅在同一个星期几内进行</p>
            <p>• 不同星期几的相同时间段不会被认为是重叠的</p>
            <p>• 例如：周一 09:00-10:00 和周二 09:00-10:00 可以同时存在</p>
          </div>
        </div>
        
        {!Array.isArray(availability) || Object.keys(groupedAvailability).length === 0 ? (
          <Empty description="暂无可用性设置" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groupedAvailability).map(([day, items]) => (
              <Card key={day} size="small" title={DAYS[parseInt(day)]}>
                <div className="space-y-2">
                  {Array.isArray(items) && items.map(item => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center p-2 bg-gray-50 rounded"
                    >
                      <div className="text-sm">
                        <span className="font-medium">
                          {item.startTime} - {item.endTime}
                        </span>
                        
                      </div>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteAvailability(item.id)}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* 阻塞时间 */}
      <Card title="阻塞时间" style={{ marginTop: '20px' }}>
        {!Array.isArray(blockedTimes) || blockedTimes.length === 0 ? (
          <Empty description="暂无阻塞时间设置" />
        ) : (
          <div className="space-y-3">
            {blockedTimes.map(blockedTime => (
              <div
                key={blockedTime.id}
                className="flex justify-between items-center p-3  border border-gray-300 rounded"
              >
                <div>
                  <div className="font-medium ">
                    {format(parseISO(blockedTime.startTime), 'yyyy年MM月dd日 HH:mm')} - 
                    {format(parseISO(blockedTime.endTime), 'HH:mm')}
                  </div>
                  {blockedTime.reason && (
                    <div className="text-sm  mt-1">
                      原因：{blockedTime.reason}
                    </div>
                  )}
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteBlockedTime(blockedTime.id)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 添加可用性弹窗 */}
      <AddAvailabilityModal
        visible={isAddModalVisible}
        onCancel={() => setIsAddModalVisible(false)}
        onSubmit={handleAddAvailability}
        form={form}
      />

      {/* 添加阻塞时间弹窗 */}
      <Modal
        title="添加阻塞时间"
        open={isBlockModalVisible}
        onCancel={() => setIsBlockModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={blockForm}
          layout="vertical"
          onFinish={handleAddBlockedTime}
        >
          <Form.Item
            name="timeRange"
            label="时间范围"
            rules={[{ required: true, message: '请选择时间范围' }]}
          >
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['开始时间', '结束时间']}
              className="w-full"
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="阻塞原因"
            rules={[{ required: true, message: '请输入阻塞原因' }]}
          >
            <Select placeholder="请选择阻塞原因">
              <Option value="会议">会议</Option>
              <Option value="个人事务">个人事务</Option>
              <Option value="休假">休假</Option>
              <Option value="其他">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex justify-end space-x-3">
              <Button onClick={() => setIsBlockModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TeacherAvailabilityCalendar
