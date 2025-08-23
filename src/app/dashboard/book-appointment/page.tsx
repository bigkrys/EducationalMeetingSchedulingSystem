'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Alert, Button, message } from 'antd'
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons'
import StudentBookingCalendar from '@/components/student/StudentBookingCalendar'
import { getCurrentUserId } from '@/lib/api/auth'

export default function BookAppointment() {
  const [studentId, setStudentId] = useState<string>('')
  const [studentName, setStudentName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  
  const router = useRouter()

  useEffect(() => {
    // 获取当前用户信息
    const fetchUserInfo = async () => {
      try {
        const userId = getCurrentUserId()
        if (!userId) {
          message.error('请先登录')
          router.push('/')
          return
        }

        // 获取用户详细信息
        const response = await fetch('/api/users/me', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        })

        if (response.ok) {
          const userData = await response.json()
          // 使用学生ID而不是用户ID
          if (userData.student && userData.student.id) {
            setStudentId(userData.student.id)
            setStudentName(userData.name || '学生')
          } else {
            setError('用户不是学生或学生信息不完整')
          }
        } else {
          setError('获取用户信息失败')
        }
      } catch (err) {
        setError('网络错误')
      } finally {
        setLoading(false)
      }
    }

    fetchUserInfo()
  }, [router])

  const handleBookingSuccess = () => {
    message.success('预约成功！')
    // 可以在这里添加其他成功后的逻辑
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">加载中...</div>
      </div>
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面头部 */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => router.back()}
              className="flex items-center"
            >
              返回
            </Button>
            <div className="flex items-center space-x-2">
              <UserOutlined className="text-blue-600 text-xl" />
              <h1 className="text-2xl font-bold text-gray-900">
                预约 - {studentName}
              </h1>
            </div>
          </div>
          
          <Card className="bg-blue-50 border-blue-200">
            <div className="text-blue-800">
              <h3 className="font-medium mb-2">预约说明</h3>
              <ul className="text-sm space-y-1">
                <li>• 选择教师后，系统会显示该教师未来30天的可用时间段</li>
                <li>• 点击任意可用时间段即可进行预约</li>
                <li>• 预约成功后，教师会收到通知并确认</li>
                <li>• 如需取消或改期，请在预约管理中进行操作</li>
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
  )
}
