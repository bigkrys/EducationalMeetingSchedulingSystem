'use client'

import React, { useState, useEffect } from 'react'
import { Card, Button, Space, message, DatePicker, Modal, Form, Select } from 'antd'
import { CalendarOutlined, ClockCircleOutlined, UserOutlined, BookOutlined } from '@ant-design/icons'

const { Option } = Select

interface CalendarSlot {
  id: string
  startTime: string
  endTime: string
  status: 'available' | 'booked' | 'pending' | 'blocked'
  studentName?: string
  subject?: string
}

interface StudentBookingCalendarProps {
  studentId: string
  studentName: string
  onBookingSuccess?: () => void
}

export default function StudentBookingCalendar({
  studentId,
  studentName,
  onBookingSuccess
}: StudentBookingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTeacher, setSelectedTeacher] = useState<string>('')
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [timeSlots, setTimeSlots] = useState<CalendarSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [bookingModalVisible, setBookingModalVisible] = useState(false)
  const [teachers, setTeachers] = useState<any[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [form] = Form.useForm()

  // 获取教师列表
  const fetchTeachers = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const response = await fetch('/api/teachers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('获取到的教师数据:', data)
        
        // 确保数据是数组
        if (Array.isArray(data)) {
          setTeachers(data)
        } else if (data && Array.isArray(data.teachers)) {
          setTeachers(data.teachers)
        } else {
          console.warn('教师数据格式不支持:', data)
          setTeachers([])
        }
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '获取教师列表失败')
        setTeachers([])
      }
    } catch (error) {
      console.error('获取教师列表失败:', error)
      message.error('获取教师列表失败')
      setTeachers([])
    }
  }

  // 获取学生已注册的科目
  const fetchStudentSubjects = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const userData = await response.json()
        console.log('获取到的学生数据:', userData)
        
        if (userData.student && userData.student.enrolledSubjects) {
          // 确保科目是数组
          if (Array.isArray(userData.student.enrolledSubjects)) {
            setSubjects(userData.student.enrolledSubjects)
          } else {
            console.warn('学生科目数据格式不支持:', userData.student.enrolledSubjects)
            setSubjects([])
          }
        } else {
          console.log('学生没有注册科目或科目数据不完整')
          setSubjects([])
        }
      } else {
        console.error('获取学生信息失败')
        setSubjects([])
      }
    } catch (error) {
      console.error('获取学生科目失败:', error)
      setSubjects([])
    }
  }

  useEffect(() => {
    fetchTeachers()
    fetchStudentSubjects()
  }, [])

  useEffect(() => {
    if (selectedDate && selectedTeacher && selectedSubject) {
      fetchTimeSlots()
    }
  }, [selectedDate, selectedTeacher, selectedSubject])

  const fetchTimeSlots = async () => {
    if (!selectedDate || !selectedTeacher || !selectedSubject) return
    
    try {
      setLoading(true)
      
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      // 调用真实的 slots API
      const response = await fetch(`/api/slots?teacherId=${selectedTeacher}&date=${selectedDate}&duration=30`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('获取到的时间槽数据:', data)
        
        // 转换API数据格式
        const slots: CalendarSlot[] = data.slots.map((slot: string, index: number) => {
          const startTime = new Date(slot)
          const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) // 30分钟
          
          return {
            id: `slot_${index}`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            status: 'available'
          }
        })
        
        setTimeSlots(slots)
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '获取可用时间失败')
        setTimeSlots([])
      }
    } catch (error) {
      console.error('获取时间槽失败:', error)
      message.error('获取可用时间失败')
      setTimeSlots([])
    } finally {
      setLoading(false)
    }
  }

  const handleDateSelect = (date: any) => {
    setSelectedDate(date.format('YYYY-MM-DD'))
    setTimeSlots([])
  }

  const handleTeacherChange = (teacherId: string) => {
    setSelectedTeacher(teacherId)
    setSelectedSubject('')
    setTimeSlots([])
    
    if (teacherId) {
      const teacher = teachers.find(t => t.id === teacherId)
      if (teacher && teacher.subjects.length > 0) {
        setSelectedSubject(teacher.subjects[0])
      }
    }
  }

  const handleSubjectChange = (subject: string) => {
    setSelectedSubject(subject)
    setTimeSlots([])
  }

  const handleSlotClick = (slot: CalendarSlot) => {
    form.setFieldsValue({
      teacherId: selectedTeacher,
      subject: selectedSubject,
      scheduledTime: slot.startTime,
      durationMinutes: 30
    })
    setBookingModalVisible(true)
  }

  const handleBooking = async (values: any) => {
    try {
      setLoading(true)
      
      const token = localStorage.getItem('accessToken')
      if (!token) {
        message.error('请先登录')
        return
      }

      const appointmentData = {
        studentId: studentId,
        teacherId: values.teacherId,
        subject: values.subject,
        scheduledTime: values.scheduledTime,
        durationMinutes: values.durationMinutes
      }

      console.log('发送预约数据:', appointmentData)

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(appointmentData)
      })

      if (response.ok) {
        const result = await response.json()
        message.success('预约成功！')
        setBookingModalVisible(false)
        form.resetFields()
        fetchTimeSlots()
        onBookingSuccess?.()
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '预约失败，请重试')
      }
    } catch (error) {
      console.error('预约失败:', error)
      message.error('预约失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 选择器 */}
      <Card title="选择教师和科目">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <UserOutlined className="mr-2" />
              选择教师
            </label>
            <Select
              value={selectedTeacher}
              onChange={handleTeacherChange}
              placeholder="请选择教师"
              className="w-full"
            >
              {Array.isArray(teachers) && teachers.map(teacher => (
                <Option key={teacher.id} value={teacher.id}>
                  {teacher.name} - {teacher.subjects?.join(', ') || '无科目'}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <BookOutlined className="mr-2" />
              选择科目
            </label>
            <Select
              value={selectedSubject}
              onChange={handleSubjectChange}
              placeholder="请选择科目"
              className="w-full"
              disabled={!selectedTeacher}
            >
              {Array.isArray(subjects) && subjects.map(subject => (
                <Option key={subject} value={subject}>
                  {subject}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CalendarOutlined className="mr-2" />
              选择日期
            </label>
            <DatePicker
              onChange={handleDateSelect}
              className="w-full"
              placeholder="请选择日期"
              disabledDate={(current) => {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                return current && current.toDate() < today
              }}
            />
          </div>
        </div>
      </Card>

      {/* 可用时间列表 */}
      {selectedDate && selectedTeacher && selectedSubject && (
        <Card title={`${selectedDate} 可用时间`}>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">加载中...</p>
            </div>
          ) : timeSlots.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.isArray(timeSlots) && timeSlots.map(slot => (
                <Button
                  key={slot.id}
                  type="default"
                  className="h-16 text-sm hover:bg-blue-50"
                  onClick={() => handleSlotClick(slot)}
                >
                  <div className="flex flex-col items-center">
                    <ClockCircleOutlined className="mb-1 text-blue-600" />
                    <span className="font-medium">
                      {new Date(slot.startTime).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">可预约</span>
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ClockCircleOutlined className="text-4xl text-gray-300 mb-4" />
              <p className="text-gray-500">该日期暂无可用时间</p>
              <p className="text-sm text-gray-400 mt-2">请选择其他日期或联系教师</p>
            </div>
          )}
        </Card>
      )}

      {/* 预约弹窗 */}
      <Modal
        title="预约会议"
        open={bookingModalVisible}
        onCancel={() => setBookingModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleBooking}
        >
          <Form.Item
            name="teacherId"
            label="教师"
            rules={[{ required: true, message: '请选择教师' }]}
          >
            <Select placeholder="请选择教师">
              {Array.isArray(teachers) && teachers.map(teacher => (
                <Option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="subject"
            label="科目"
            rules={[{ required: true, message: '请选择科目' }]}
          >
            <Select placeholder="请选择科目">
              {Array.isArray(subjects) && subjects.map(subject => (
                <Option key={subject} value={subject}>
                  {subject}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="scheduledTime"
            label="预约时间"
            rules={[{ required: true, message: '请选择预约时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder="请选择预约时间"
              className="w-full"
            />
          </Form.Item>

          <Form.Item
            name="durationMinutes"
            label="时长（分钟）"
            rules={[{ required: true, message: '请输入时长' }]}
          >
            <Select defaultValue={30}>
              <Option value={30}>30分钟</Option>
              <Option value={60}>60分钟</Option>
              <Option value={90}>90分钟</Option>
            </Select>
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex justify-end space-x-3">
              <Button onClick={() => setBookingModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                确认预约
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
