'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Alert, Button } from 'antd'
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons'
import StudentBookingCalendar from '@/components/student/StudentBookingCalendar'
import { getCurrentUserId } from '@/lib/api/auth'
import { userService } from '@/lib/api/user-service'
import { StudentGuard } from '@/components/shared/AuthGuard'
import PageLoader from '@/components/shared/PageLoader'
import { showErrorMessage, showSuccessMessage } from '@/lib/api/global-error-handler'
import * as Sentry from '@sentry/nextjs'
import { incr } from '@/lib/frontend/metrics'

export default function BookAppointment() {
  const [studentId, setStudentId] = useState<string>('')
  const [studentName, setStudentName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const router = useRouter()

  useEffect(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    // 获取当前用户信息
    const fetchUserInfo = async () => {
      try {
        const userId = getCurrentUserId()
        if (!userId) {
          showErrorMessage('请先登录')
          router.push('/')
          return
        }
        // 使用 userService（内存缓存 + in-flight 去重）获取当前用户
        const userData = await userService.getCurrentUser()
        if (userData && (userData as any).student && (userData as any).student.id) {
          setStudentId((userData as any).student.id)
          setStudentName((userData as any).name || '学生')
        } else {
          setError('用户不是学生或学生信息不完整')
        }
      } catch (err) {
        setError('网络错误')
      } finally {
        setLoading(false)
        try {
          const t1 = typeof performance !== 'undefined' ? performance.now() : 0
          Sentry.metrics.distribution('book_appointment_load_ms', Math.max(0, t1 - t0))
          incr('biz.page.view', 1, { page: 'book_appointment' })
        } catch {}
      }
    }

    fetchUserInfo()
  }, [router])

  const handleBookingSuccess = () => {
    showSuccessMessage('预约成功！')
    // 可以在这里添加其他成功后的逻辑
  }

  if (loading) {
    return (
      <PageLoader message="正在准备预约系统" description="正在获取您的学生信息和可预约教师列表" />
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            action={
              <Button size="small" onClick={() => window.location.reload()}>
                重试
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <StudentGuard>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 页面头部 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <UserOutlined className="text-blue-600 text-lg" />
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">预约 · {studentName}</h1>
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <div className="text-blue-800 text-sm">
                <ul className="space-y-1 list-disc pl-5">
                  <li>选择教师后将展示未来 30 天可用时间段</li>
                  <li>点击可用时间即可预约；成功后教师会收到通知</li>
                  <li>取消/改期请到“我的预约”处理</li>
                </ul>
              </div>
            </Card>
          </div>

          {/* 预约日历组件 */}
          <StudentBookingCalendar
            studentId={studentId}
            studentName={studentName}
            onBookingSuccess={handleBookingSuccess}
          />
        </div>
      </div>
    </StudentGuard>
  )
}
