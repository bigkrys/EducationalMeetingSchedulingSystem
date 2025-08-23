'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SubjectSelector from '@/components/shared/SubjectSelector'
import RoleSelector from '@/components/shared/RoleSelector'
import StudentFields from '@/components/shared/StudentFields'
import TeacherFields from '@/components/shared/TeacherFields'

interface FormData {
  email: string
  password: string
  confirmPassword: string
  name: string
  role: 'student' | 'teacher'
  serviceLevel?: 'level1' | 'level2' | 'premium'
  enrolledSubjects?: string[]
  subjects?: string[]
  maxDailyMeetings?: number
  bufferMinutes?: number
}

export default function LoginForm() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'student',
    serviceLevel: 'level1',
    enrolledSubjects: [],
    subjects: [],
    maxDailyMeetings: 6,
    bufferMinutes: 15
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!isLogin && formData.password !== formData.confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      
      // 注册时需要转换字段名以匹配后端API
      let requestBody: any = formData
      if (!isLogin) {
        if (formData.role === 'student') {
          requestBody = {
            email: formData.email,
            password: formData.password,
            name: formData.name,
            role: formData.role,
            serviceLevel: formData.serviceLevel,
            subjectIds: formData.enrolledSubjects || [] // 转换为后端期望的字段名
          }
        } else if (formData.role === 'teacher') {
          requestBody = {
            email: formData.email,
            password: formData.password,
            name: formData.name,
            role: formData.role,
            subjectIds: formData.subjects || [], // 转换为后端期望的字段名
            maxDailyMeetings: formData.maxDailyMeetings,
            bufferMinutes: formData.bufferMinutes
          }
        }
      }
      
      // 调试日志
      console.log('=== 注册调试信息 ===')
      console.log('原始表单数据:', formData)
      console.log('转换后的请求数据:', requestBody)
      console.log('====================')
      
      // 打印请求信息
      console.log('=== 发送请求 ===')
      console.log('请求URL:', endpoint)
      console.log('请求方法:', 'POST')
      console.log('请求头:', { 'Content-Type': 'application/json' })
      console.log('请求体:', JSON.stringify(requestBody, null, 2))
      console.log('================')
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      // 打印响应信息
      console.log('=== 收到响应 ===')
      console.log('响应状态:', response.status)
      console.log('响应状态文本:', response.statusText)
      console.log('响应头:', Object.fromEntries(response.headers.entries()))
      console.log('================')
      
      if (response.ok) {
        const data = await response.json()
        console.log('=== 响应数据 ===')
        console.log('响应体:', JSON.stringify(data, null, 2))
        console.log('================')
        
        if (isLogin) {
          // 登录成功，存储 token 并跳转
          localStorage.setItem('accessToken', data.accessToken)
          localStorage.setItem('refreshToken', data.refreshToken)
          localStorage.setItem('userRole', data.role)
          // 使用 router.push 避免页面闪烁
          router.push('/dashboard')
        } else {
          // 注册成功，切换到登录模式
          setIsLogin(true)
          setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }))
        }
      } else {
        const errorData = await response.json()
        console.log('=== 注册失败调试信息 ===')
        console.log('响应状态:', response.status)
        console.log('错误数据:', JSON.stringify(errorData, null, 2))
        console.log('=======================')
        setError(errorData.message || '操作失败')
      }
    } catch (error) {
      console.log('=== 注册异常调试信息 ===')
      console.log('异常类型:', error?.constructor?.name)
      console.log('异常详情:', error)
      if (error instanceof Error) {
        console.log('异常消息:', error.message)
        console.log('异常堆栈:', error.stack)
      }
      console.log('=======================')
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 如果正在加载，显示加载状态
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-6 bg-gray-200 rounded mb-2"></div>
            <div className="h-6 bg-gray-200 rounded mb-2"></div>
            <div className="h-6 bg-gray-200 rounded mb-4"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-xl p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {isLogin ? '登录账户' : '创建账户'}
        </h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 邮箱 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">邮箱地址</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            required
            placeholder="请输入邮箱"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            required
            placeholder="请输入密码"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 确认密码（仅注册时显示） */}
        {!isLogin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              required
              placeholder="请再次输入密码"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* 姓名（仅注册时显示） */}
        {!isLogin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
              placeholder="请输入姓名"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* 角色选择（仅注册时显示） */}
        {!isLogin && (
          <RoleSelector
            value={formData.role}
            onChange={(role: 'student' | 'teacher' | 'admin') => handleInputChange('role', role)}
          />
        )}

        {/* 学生相关字段 */}
        {!isLogin && formData.role === 'student' && (
          <StudentFields
            serviceLevel={formData.serviceLevel || 'level1'}
            enrolledSubjects={formData.enrolledSubjects || []}
            onServiceLevelChange={(level: 'level1' | 'level2' | 'premium') => handleInputChange('serviceLevel', level)}
            onEnrolledSubjectsChange={(subjects: string[]) => handleInputChange('enrolledSubjects', subjects)}
          />
        )}

        {/* 教师相关字段 */}
        {!isLogin && formData.role === 'teacher' && (
          <TeacherFields
            subjects={formData.subjects || []}
            maxDailyMeetings={formData.maxDailyMeetings || 6}
            bufferMinutes={formData.bufferMinutes || 15}
            onSubjectsChange={(subjects: string[]) => handleInputChange('subjects', subjects)}
            onMaxDailyMeetingsChange={(value: number) => handleInputChange('maxDailyMeetings', value)}
            onBufferMinutesChange={(value: number) => handleInputChange('bufferMinutes', value)}
          />
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
        </button>

        {/* 切换模式 */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin)
              setError(null)
              setFormData(prev => ({
                ...prev,
                password: '',
                confirmPassword: '',
                name: '',
                role: 'student'
              }))
            }}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isLogin ? '没有账户？点击注册' : '已有账户？点击登录'}
          </button>
        </div>
      </form>
    </div>
  )
}
