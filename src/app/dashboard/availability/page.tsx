'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  Button,
  Alert,
  Modal,
  Form,
  Select,
  TimePicker,
  Switch,
  Space,
  Row,
  Col,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { httpClient } from '@/lib/api/http-client'
import { getCurrentUserId } from '@/lib/api/auth'
import { userService } from '@/lib/api/user-service'
import TeacherAvailabilityCalendar from '@/components/teacher/TeacherAvailabilityCalendar'
import { TeacherGuard } from '@/components/shared/AuthGuard'
import PageLoader from '@/components/shared/PageLoader'
import { showErrorMessage } from '@/lib/api/global-error-handler'

const { Option } = Select
const { Title, Text } = Typography

interface TeacherAvailability {
  id: string
  teacherId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isRecurring: boolean
  createdAt: string
}

interface Teacher {
  id: string
  name: string
  email: string
  subjects: string[]
  maxDailyMeetings: number
  bufferMinutes: number
}

export default function TeacherAvailability() {
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [availabilities, setAvailabilities] = useState<TeacherAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedAvailability, setSelectedAvailability] = useState<TeacherAvailability | null>(null)
  const [form] = Form.useForm()

  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      try {
        const userId = getCurrentUserId()
        if (!userId) {
          showErrorMessage('请先登录')
          router.push('/')
          return
        }

        const userData = await userService.getCurrentUser()
        if (userData && (userData as any).teacher && (userData as any).teacher.id) {
          const ud = userData as any
          setTeacher({
            id: ud.teacher.id,
            name: ud.name,
            email: ud.email,
            subjects: ud.teacher.subjects || [],
            maxDailyMeetings: ud.teacher.maxDailyMeetings || 6,
            bufferMinutes: ud.teacher.bufferMinutes || 15,
          })
        } else {
          console.error('教师信息不完整:', userData)
          setError('用户不是教师或教师信息不完整')
        }
      } catch (err) {
        console.error('获取教师信息网络错误:', err)
        setError('网络错误')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const refreshAvailabilities = useCallback(async () => {
    if (!teacher) return
    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setError('未登录')
        return
      }

      const response = await fetch(`/api/teachers/${teacher.id}/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        let availabilityArray = []
        if (Array.isArray(data)) {
          availabilityArray = data
        } else if (data && data.availability && Array.isArray(data.availability)) {
          availabilityArray = data.availability
        } else if (data && Array.isArray(data.items)) {
          availabilityArray = data.items
        } else {
          console.warn('API返回的可用性数据格式不支持:', data)
          availabilityArray = []
        }

        setAvailabilities(availabilityArray)
      } else {
        const errorData = await response.json().catch(() => ({ message: '未知错误' }))
        setError(errorData.message || '获取可用性数据失败')
      }
    } catch (err) {
      console.error('获取可用性数据网络错误:', err)
      setError('获取可用性数据失败')
    } finally {
      setLoading(false)
    }
  }, [teacher])

  useEffect(() => {
    if (!teacher) return
    refreshAvailabilities()
  }, [teacher, refreshAvailabilities])

  // 安全的统计数据计算函数
  const getSafeStats = () => {
    if (!Array.isArray(availabilities)) {
      return { count: 0, hours: '0.0', status: '建议设置可用时间' }
    }

    const count = availabilities.length
    let totalHours = 0

    if (count > 0) {
      totalHours = availabilities.reduce((total, item) => {
        try {
          const start = new Date(`2000-01-01T${item.startTime}:00`)
          const end = new Date(`2000-01-01T${item.endTime}:00`)
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
          return total + hours
        } catch (error) {
          console.warn('时间计算错误:', error, item)
          return total
        }
      }, 0)
    }

    return {
      count,
      hours: totalHours.toFixed(1),
      status: count > 0 ? '配置完成' : '建议设置可用时间',
    }
  }

  if (!teacher) {
    if (loading) {
      return (
        <PageLoader message="正在加载教师信息" description="正在获取您的教学安排和可用时间设置" />
      )
    }

    if (error) {
      return (
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card className="shadow-lg">
              <Alert
                message="加载失败"
                description={error}
                type="error"
                showIcon
                action={
                  <Button size="small" danger onClick={() => router.push('/dashboard')}>
                    返回主页
                  </Button>
                }
              />
            </Card>
          </div>
        </div>
      )
    }

    return <PageLoader message="教师信息验证中" description="正在验证您的教师身份和权限" />
  }

  return (
    <TeacherGuard>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 顶部导航栏 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              {/* 返回按钮 */}
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                返回
              </button>

              <h1 className="text-2xl font-bold text-gray-900">设置可用性</h1>
            </div>
          </div>

          {teacher && (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">可用性管理</h2>
                <p className="text-gray-600 mb-4">管理您的可用时间和阻塞时间</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{getSafeStats().count}</div>
                    <div className="text-sm text-blue-600">总时间段</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{getSafeStats().hours}</div>
                    <div className="text-sm text-green-600">总小时数</div>
                  </div>
                </div>
              </div>

              <TeacherAvailabilityCalendar
                teacherId={teacher.id}
                teacherName={`${teacher.name.slice(0, 8)}`}
                onRefresh={refreshAvailabilities}
              />
            </div>
          )}

          {/* 错误和成功消息 */}
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
    </TeacherGuard>
  )
}
