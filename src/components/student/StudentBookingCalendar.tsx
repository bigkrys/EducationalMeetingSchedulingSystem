'use client'

import React, { useState, useEffect } from 'react'
import { Card, Button, Space, DatePicker, Modal, Form, Select } from 'antd'
import {
  showApiError,
  showErrorMessage,
  showSuccessMessage,
  showWarningMessage,
} from '@/lib/api/global-error-handler'
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  BookOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'

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
  onBookingSuccess,
}: StudentBookingCalendarProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTeacher, setSelectedTeacher] = useState<string>('')
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [timeSlots, setTimeSlots] = useState<CalendarSlot[]>([])
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [waitlistCountMap, setWaitlistCountMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true) // 添加初始加载状态
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingModalVisible, setBookingModalVisible] = useState(false)
  const [allTeachers, setAllTeachers] = useState<any[]>([])
  const [studentSubjects, setStudentSubjects] = useState<string[]>([])
  const [filteredTeachers, setFilteredTeachers] = useState<any[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([])
  const [form] = Form.useForm()
  // 候补详情弹窗
  const [waitlistVisible, setWaitlistVisible] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistSlotIso, setWaitlistSlotIso] = useState<string>('')
  const [waitlistItems, setWaitlistItems] = useState<
    Array<{
      id: string
      slot: string
      priority: number
      createdAt: string
      studentId?: string
      studentName?: string
    }>
  >([])
  const [myWaitPosition, setMyWaitPosition] = useState<number | null>(null)
  const [myWaitEntryId, setMyWaitEntryId] = useState<string>('')

  // 获取教师列表
  const fetchTeachers = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        showErrorMessage('请先登录')
        return
      }

      const response = await fetch('/api/teachers', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()

        // 确保数据是数组
        let teachersData = []
        if (Array.isArray(data)) {
          teachersData = data
        } else if (data && Array.isArray(data.teachers)) {
          teachersData = data.teachers
        } else {
          console.warn('教师数据格式不支持:', data)
          teachersData = []
        }

        setAllTeachers(teachersData)
        return teachersData
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
        setAllTeachers([])
        return []
      }
    } catch (error) {
      showErrorMessage('获取教师列表失败')
      setAllTeachers([])
      return []
    }
  }

  // 获取学生已注册的科目
  const fetchStudentSubjects = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        showErrorMessage('请先登录')
        return
      }

      const response = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const userData = await response.json()

        let subjects = []
        if (userData.student && userData.student.enrolledSubjects) {
          // 处理不同的科目数据格式
          if (Array.isArray(userData.student.enrolledSubjects)) {
            // 如果已经是数组，直接使用
            subjects = userData.student.enrolledSubjects
          } else if (typeof userData.student.enrolledSubjects === 'string') {
            // 如果是字符串，转换为数组（支持逗号分隔或单个科目）
            subjects = userData.student.enrolledSubjects
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0)
          } else {
            console.warn(
              '学生科目数据格式不支持:',
              userData.student.enrolledSubjects,
              '类型:',
              typeof userData.student.enrolledSubjects
            )
            subjects = []
          }
        } else {
          subjects = []
        }

        setStudentSubjects(subjects)
        return subjects
      } else {
        console.error('获取学生信息失败')
        setStudentSubjects([])
        return []
      }
    } catch (error) {
      console.error('获取学生科目失败:', error)
      setStudentSubjects([])
      return []
    }
  }

  // 过滤教师和科目
  const filterTeachersAndSubjects = (teachers: any[], subjects: string[]) => {
    if (!subjects.length) {
      setFilteredTeachers([])
      setAvailableSubjects([])
      return
    }

    // 只显示能教授学生已注册科目的教师
    const availableTeachers = teachers.filter((teacher) => {
      if (!teacher.subjects || !Array.isArray(teacher.subjects)) {
        return false
      }

      // 检查教师是否至少能教授学生的一个科目
      const canTeach = teacher.subjects.some((teacherSubject: string) =>
        subjects.includes(teacherSubject)
      )

      return canTeach
    })

    // 学生可选的科目是：学生已注册的科目
    const availableSubjects = [...subjects]

    setFilteredTeachers(availableTeachers)
    setAvailableSubjects(availableSubjects)
  }

  useEffect(() => {
    const loadData = async () => {
      setInitialLoading(true) // 开始初始加载
      try {
        const [teachers, subjects] = await Promise.all([fetchTeachers(), fetchStudentSubjects()])

        filterTeachersAndSubjects(teachers, subjects)
      } catch (error) {
        console.error('初始数据加载失败:', error)
      } finally {
        setInitialLoading(false) // 完成初始加载
      }
    }

    loadData()
  }, [])

  const fetchTimeSlots = React.useCallback(async () => {
    if (!selectedDate || !selectedTeacher || !selectedSubject) return

    try {
      setLoading(true)

      const token = localStorage.getItem('accessToken')
      if (!token) {
        showErrorMessage('请先登录')
        return
      }

      // 调用真实的 slots API
      const response = await fetch(
        `/api/slots?teacherId=${selectedTeacher}&date=${selectedDate}&duration=30`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()

        // 转换API数据格式
        const slots: CalendarSlot[] = data.slots.map((slot: string, index: number) => {
          const startTime = new Date(slot)
          const endTime = new Date(startTime.getTime() + 30 * 60 * 1000) // 30分钟

          return {
            id: `slot_${index}`,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            status: 'available',
          }
        })

        setTimeSlots(slots)
        // 记录已预约与候补计数（用于展示热门时段）
        const booked: string[] = Array.isArray(data.bookedSlots) ? data.bookedSlots : []
        const wlArr: Array<{ slot: string; count: number }> = Array.isArray(data.waitlistCount)
          ? data.waitlistCount
          : []
        const wlMap: Record<string, number> = {}
        wlArr.forEach((r) => {
          wlMap[r.slot] = r.count
        })
        setBookedSlots(booked)
        setWaitlistCountMap(wlMap)
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
        setTimeSlots([])
        setBookedSlots([])
        setWaitlistCountMap({})
      }
    } catch (error) {
      showErrorMessage('获取可用时间失败')
      setTimeSlots([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate, selectedTeacher, selectedSubject])

  const openWaitlistModal = async (slotIso: string) => {
    if (!selectedTeacher) return
    setWaitlistVisible(true)
    setWaitlistLoading(true)
    setWaitlistSlotIso(slotIso)
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(
        `/api/waitlist/slot?teacherId=${encodeURIComponent(selectedTeacher)}&slot=${encodeURIComponent(
          slotIso
        )}&studentId=${encodeURIComponent(studentId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        showApiError({ code: json?.code ?? json?.error, message: json?.message || '获取候补失败' })
        return
      }
      const items = Array.isArray(json.waitlist) ? json.waitlist : []
      setWaitlistItems(items)
      setMyWaitPosition(typeof json.myPosition === 'number' ? json.myPosition : null)
      // 找到我的候补条目 id（若接口返回）
      const mine = items.find((it: any) => it.studentId && it.studentId === studentId)
      setMyWaitEntryId(mine?.id || '')
    } catch (e) {
      showErrorMessage('获取候补失败')
    } finally {
      setWaitlistLoading(false)
    }
  }

  const joinWaitlistForCurrentSlot = async () => {
    if (!selectedTeacher || !waitlistSlotIso) return
    if (!selectedSubject) {
      showWarningMessage('请先选择科目')
      return
    }
    try {
      const token = localStorage.getItem('accessToken')
      const dateStr = new Date(waitlistSlotIso).toISOString().slice(0, 10)
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          teacherId: selectedTeacher,
          date: dateStr,
          slot: waitlistSlotIso,
          studentId,
          subject: selectedSubject,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        showApiError({ code: json?.code ?? json?.error, message: json?.message || '加入候补失败' })
        return
      }
      const pos = typeof json.position === 'number' ? json.position : undefined
      showSuccessMessage(pos ? `已加入候补（当前第 ${pos} 位）` : '已加入候补')
      // 刷新候补列表与等待人数
      await openWaitlistModal(waitlistSlotIso)
      await fetchTimeSlots()
    } catch (e) {
      showErrorMessage('加入候补失败')
    }
  }

  const removeMyWaitlistEntry = async () => {
    if (!myWaitEntryId) return
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch('/api/waitlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: myWaitEntryId, studentId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        showApiError({ code: json?.code ?? json?.error, message: json?.message || '移除候补失败' })
        return
      }
      showSuccessMessage('已移除候补')
      // 刷新候补列表与等待人数
      await openWaitlistModal(waitlistSlotIso)
      await fetchTimeSlots()
    } catch (e) {
      showErrorMessage('移除候补失败')
    }
  }

  useEffect(() => {
    if (selectedDate && selectedTeacher && selectedSubject) {
      fetchTimeSlots()
    }
  }, [selectedDate, selectedTeacher, selectedSubject, fetchTimeSlots])

  const handleDateSelect = (date: any) => {
    setSelectedDate(date.format('YYYY-MM-DD'))
    setTimeSlots([])
  }

  const handleTeacherChange = (teacherId: string) => {
    setSelectedTeacher(teacherId)
    setSelectedSubject('')
    setTimeSlots([])

    if (teacherId) {
      const teacher = filteredTeachers.find((t) => t.id === teacherId)
      if (teacher && teacher.subjects && Array.isArray(teacher.subjects)) {
        // 获取该教师可以教授的且学生ç
        const teacherStudentCommonSubjects = teacher.subjects.filter((subject: string) =>
          studentSubjects.includes(subject)
        )

        if (teacherStudentCommonSubjects.length === 0) {
          console.warn('警告：选择的教师与学生没有共同科目，这不应该发生！')
          showWarningMessage('该教师暂时无法教授您的科目，请选择其他教师')
          setSelectedTeacher('')
          return
        }

        // 如果只有一个共同科目，自动选择
        if (teacherStudentCommonSubjects.length === 1) {
          setSelectedSubject(teacherStudentCommonSubjects[0])
        }
        // 如果有多个科目，保持为空让用户选择
      }
    }
  }

  const handleSubjectChange = (subject: string) => {
    setSelectedSubject(subject)
    setTimeSlots([])
  }

  const handleSlotClick = (slot: CalendarSlot) => {
    // 只有可预约的时间槽才能点击
    if (slot.status !== 'available') {
      return
    }

    // 将ISO时间字符串转换为dayjs对象
    const dayjs = require('dayjs')
    const scheduledTime = dayjs(slot.startTime)

    form.setFieldsValue({
      teacherId: selectedTeacher,
      subject: selectedSubject,
      scheduledTime: scheduledTime,
      durationMinutes: 30, // 固定为30分钟
    })
    setBookingModalVisible(true)
  }

  const handleBooking = async (values: any) => {
    if (bookingSubmitting) return

    try {
      setBookingSubmitting(true)
      setLoading(true)

      const token = localStorage.getItem('accessToken')
      if (!token) {
        showErrorMessage('请先登录')
        return
      }

      // 确保时间数据正确转换
      let scheduledTime = values.scheduledTime
      if (values.scheduledTime && typeof values.scheduledTime.toISOString === 'function') {
        scheduledTime = values.scheduledTime.toISOString()
      } else if (typeof values.scheduledTime === 'string') {
        scheduledTime = values.scheduledTime
      } else {
        showErrorMessage('预约时间格式错误')
        return
      }

      const appointmentData = {
        studentId: studentId,
        teacherId: values.teacherId,
        subject: values.subject,
        scheduledTime: scheduledTime,
        durationMinutes: 30, // 固定为30分钟，与时间槽保持一致
        idempotencyKey: `${studentId}-${values.teacherId}-${scheduledTime}`, // 添加幂等性键
      }

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(appointmentData),
      })

      if (response.ok) {
        const result = await response.json()
        showSuccessMessage('预约成功！正在跳转到我的预约页面...')
        setBookingModalVisible(false)
        form.resetFields()
        onBookingSuccess?.()

        // 延迟跳转，让用户看到成功消息
        setTimeout(() => {
          router.push('/dashboard/my-appointments')
        }, 1000)
      } else {
        const errorData = await response.json()

        // 如果是 SLOT_TAKEN，使用更友好的提示并刷新可约时间
        if (errorData && (errorData.error === 'SLOT_TAKEN' || errorData.code === 'SLOT_TAKEN')) {
          showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
          // 关闭弹窗并刷新可约时间列表
          setBookingModalVisible(false)
          form.resetFields()
          // 确保在下一 tick 再刷新，以避免冲突
          setTimeout(() => {
            fetchTimeSlots()
          }, 200)
        } else {
          showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
        }
      }
    } catch (error) {
      showErrorMessage('预约失败，请重试')
    } finally {
      setBookingSubmitting(false)
      setLoading(false)
    }
  }

  // 显示用户提示信息
  const renderUserInfo = () => {
    if (initialLoading) {
      return (
        <Card title="加载中...">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">正在加载您的预约信息</h3>
            <p className="text-gray-500">请稍候，正在获取您的科目和教师列表...</p>
          </div>
        </Card>
      )
    }

    if (!studentSubjects.length) {
      return (
        <Card title="无法预约">
          <div className="text-center py-8">
            <div className="text-yellow-600 mb-4">
              <BookOutlined style={{ fontSize: '48px' }} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">您还没有注册任何科目</h3>
            <p className="text-gray-500 mb-4">请联系管理员为您注册科目后再进行预约</p>
          </div>
        </Card>
      )
    }

    if (!filteredTeachers.length) {
      return (
        <Card title="暂无可选老师">
          <div className="text-center py-8">
            <div className="text-blue-400 mb-4">
              <UserOutlined style={{ fontSize: '48px' }} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无可选老师，请稍后</h3>
            <p className="text-gray-500 mb-4">您已注册的科目：{studentSubjects.join(', ')}</p>
            <p className="text-gray-500">教师们可能正在更新课程安排，请稍后再试</p>
            <div className="mt-6">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                刷新重试
              </button>
            </div>
          </div>
        </Card>
      )
    }

    return null
  }

  return (
    <div className="space-y-6">
      {/* 用户提示信息 */}
      {renderUserInfo()}

      {/* 选择器 */}
      {!initialLoading && studentSubjects.length > 0 && filteredTeachers.length > 0 && (
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
                {Array.isArray(filteredTeachers) &&
                  filteredTeachers.map((teacher) => (
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
                placeholder={selectedTeacher ? '请选择科目' : '请先选择教师'}
                className="w-full"
                disabled={!selectedTeacher}
              >
                {selectedTeacher &&
                  Array.isArray(availableSubjects) &&
                  (() => {
                    const teacher = filteredTeachers.find((t) => t.id === selectedTeacher)
                    if (!teacher || !teacher.subjects) return []

                    // 只显示教师能教授且学生已注册的科目
                    const commonSubjects = teacher.subjects.filter((subject: string) =>
                      studentSubjects.includes(subject)
                    )

                    return commonSubjects.map((subject: string) => (
                      <Option key={subject} value={subject}>
                        {subject}
                      </Option>
                    ))
                  })()}
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
      )}

      {/* 热门已满时段（候补） */}
      {!initialLoading && bookedSlots.length > 0 && (
        <Card title="已满时段（可候补）" extra={<a href="/dashboard/waitlist">去候补</a>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {bookedSlots
              .slice()
              .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())
              .slice(0, 8)
              .map((iso) => {
                const local = new Date(iso)
                const label = local.toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
                const cnt = waitlistCountMap[iso] || 0
                return (
                  <button
                    key={iso}
                    onClick={() => openWaitlistModal(iso)}
                    className="border border-gray-200 rounded px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-sm text-left"
                  >
                    <span className="text-gray-700">{label}</span>
                    <span className="text-gray-500">候补{cnt}</span>
                  </button>
                )
              })}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            显示前 8 个已满时段；更多请前往“候补队列”。
          </div>
        </Card>
      )}

      {/* 可用时间列表 */}
      {!initialLoading && selectedDate && selectedTeacher && selectedSubject && (
        <Card
          title={
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CalendarOutlined className="text-blue-600" />
                <span className="text-lg font-semibold text-gray-900">{selectedDate} 可用时间</span>
              </div>
              <div>
                <Button onClick={() => fetchTimeSlots()} size="small">
                  刷新
                </Button>
              </div>
            </div>
          }
          className="shadow-sm border-gray-200"
        >
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">正在加载可用时间</h3>
              <p className="text-gray-500">请稍候，正在查询教师的可用时间...</p>
            </div>
          ) : timeSlots.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.isArray(timeSlots) &&
                timeSlots.map((slot) => (
                  <Button
                    key={slot.id}
                    type={slot.status === 'available' ? 'default' : 'dashed'}
                    disabled={slot.status !== 'available'}
                    className={`h-20 w-full text-sm transition-all duration-200 shadow-sm ${
                      slot.status === 'available'
                        ? 'bg-white hover:bg-blue-50 hover:border-blue-300 border-gray-200'
                        : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                    }`}
                    onClick={() => handleSlotClick(slot)}
                  >
                    <div className="flex flex-col items-center justify-center h-full space-y-1">
                      <div className="text-center">
                        <div className={`font-semibold text-base leading-tight `}>
                          {new Date(slot.startTime).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </div>
                        {/* <div className="text-[10px] text-gray-400 mt-1">
                          UTC {new Date(slot.startTime).toISOString().slice(11, 16)}
                        </div> */}
                      </div>
                    </div>
                  </Button>
                ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <ClockCircleOutlined className="text-2xl text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">暂无可用时间</h3>
              <p className="text-gray-500 mb-4">该日期暂无可用时间，请选择其他日期或联系教师</p>
              <div className="text-sm text-gray-400">
                <p>• 教师可能还没有设置该日期的可用时间</p>
                <p>• 该日期的可用时间可能已被预约</p>
                <p>• 请尝试选择其他日期</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 预约弹窗 */}
      <Modal
        title="预约30分钟会议"
        open={bookingModalVisible}
        onCancel={() => setBookingModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleBooking}>
          <Form.Item
            name="teacherId"
            label="教师"
            rules={[{ required: true, message: '请选择教师' }]}
          >
            <Select placeholder="请选择教师">
              {Array.isArray(filteredTeachers) &&
                filteredTeachers.map((teacher) => (
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
              {Array.isArray(availableSubjects) &&
                availableSubjects.map((subject) => (
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
            help="请选择具体的预约时间，系统会自动填充您选择的时间段"
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder="请选择预约时间"
              className="w-full"
              minuteStep={30}
              showNow={false}
            />
          </Form.Item>

          <Form.Item name="durationMinutes" label="预约时长" initialValue={30}>
            <div className="py-2 px-3 bg-gray-50 border border-gray-200 rounded text-gray-700">
              30分钟（固定时长）
            </div>
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex justify-end space-x-3">
              <Button onClick={() => setBookingModalVisible(false)} disabled={bookingSubmitting}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={bookingSubmitting}
                disabled={bookingSubmitting}
              >
                确认预约
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 候补详情弹窗 */}
      <Modal
        title={`候补队列详情${waitlistSlotIso ? ' · ' + new Date(waitlistSlotIso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`}
        open={waitlistVisible}
        onCancel={() => setWaitlistVisible(false)}
        footer={null}
        width={520}
      >
        <div className="space-y-3">
          {waitlistLoading ? (
            <div className="text-center text-sm text-gray-500">正在加载候补队列…</div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <div>
                  共 <span className="font-medium">{waitlistItems.length}</span> 人排队
                  {myWaitPosition ? (
                    <span className="ml-2 text-blue-600">我的位置：第 {myWaitPosition} 位</span>
                  ) : (
                    <span className="ml-2 text-gray-400">（你尚未加入该时段）</span>
                  )}
                </div>
                <div className="space-x-2">
                  {myWaitPosition ? (
                    <Button size="small" danger onClick={removeMyWaitlistEntry}>
                      退出此时段候补
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      onClick={joinWaitlistForCurrentSlot}
                      disabled={!selectedSubject}
                    >
                      加入此时段候补
                    </Button>
                  )}
                </div>
              </div>
              <div className="border rounded">
                <div className="max-h-72 overflow-auto divide-y">
                  {waitlistItems.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">该时段暂无候补</div>
                  ) : (
                    waitlistItems.map((it: any, idx: number) => (
                      <div
                        key={it.id}
                        className={`p-3 flex items-center justify-between ${it.studentId === studentId ? 'bg-blue-50' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className="w-8 text-right text-gray-500">{idx + 1}</span>
                          <span className="text-gray-800">
                            {it.studentName || (it.studentId === studentId ? '我' : '同学')}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">优先级 {it.priority}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
