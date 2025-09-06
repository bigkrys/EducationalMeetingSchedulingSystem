'use client'

import { useState } from 'react'
import useSubmitting from '@/lib/hooks/useSubmitting'
import { useRouter } from 'next/navigation'
import SubjectSelector from '@/components/shared/SubjectSelector'
import RoleSelector from '@/components/shared/RoleSelector'
import StudentFields from '@/components/shared/StudentFields'
import TeacherFields from '@/components/shared/TeacherFields'
import { showApiError, showErrorMessage } from '@/lib/api/global-error-handler'
import { getFriendlyErrorMessage } from '@/lib/frontend/error-messages'

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
    bufferMinutes: 15,
  })
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const { submitting: submittingForm, wrap: wrapSubmit } = useSubmitting(false)
  const [passwordError, setPasswordError] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || redirecting || submittingForm) return

    await wrapSubmit(async () => {
      setLoading(true)
      setError(null)

      try {
        if (!isLogin && formData.password !== formData.confirmPassword) {
          setError('两次输入的密码不一致')
          setLoading(false)
          return
        }
        if (!isLogin && passwordError.length > 0) {
          setError(passwordError)
          setLoading(false)
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
              subjectIds: formData.enrolledSubjects || [], // 转换为后端期望的字段名
            }
          } else if (formData.role === 'teacher') {
            requestBody = {
              email: formData.email,
              password: formData.password,
              name: formData.name,
              role: formData.role,
              subjectIds: formData.subjects || [], // 转换为后端期望的字段名
              maxDailyMeetings: formData.maxDailyMeetings,
              bufferMinutes: formData.bufferMinutes,
            }
          }
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (response.ok) {
          const data = await response.json()

          if (isLogin) {
            // 登录成功，存储 token
            localStorage.setItem('accessToken', data.accessToken)
            localStorage.setItem('refreshToken', data.refreshToken)
            localStorage.setItem('userRole', data.role)

            // 显示跳转状态
            setLoading(false)
            setRedirecting(true)

            // 短暂延迟后跳转，让用户看到成功反馈
            setTimeout(() => {
              router.push('/dashboard')
            }, 800)
          } else {
            // 注册成功，切换到登录模式
            setIsLogin(true)
            setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }))
          }
        } else {
          const errorData = await response.json()

          // 处理注册验证错误，显示更详细的错误信息
          if (!isLogin && errorData.error === 'BAD_REQUEST' && errorData.details) {
            // 处理 Zod 验证错误
            const fieldErrors = errorData.details.map((err: any) => {
              const field = err.path[0]
              const fieldNames: { [key: string]: string } = {
                email: '邮箱',
                password: '密码',
                name: '姓名',
                serviceLevel: '服务级别',
                subjectIds: '科目',
                maxDailyMeetings: '每日最大会议数',
                bufferMinutes: '缓冲时间',
              }
              const fieldName = fieldNames[field] || field
              return `${fieldName}: ${err.message}`
            })
            const errorMessage = fieldErrors.join('; ')
            showErrorMessage(errorMessage)
            setError(errorMessage)
          } else if (!isLogin && errorData.error === 'EMAIL_EXISTS') {
            // 处理邮箱已存在错误
            const friendly = getFriendlyErrorMessage({
              code: errorData?.error,
              message: errorData?.message,
            })
            showErrorMessage(friendly)
            setError(friendly)
          } else {
            // 处理其他错误
            showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
            setError(
              getFriendlyErrorMessage({
                code: errorData?.code ?? errorData?.error,
                message: errorData?.message,
              })
            )
          }
        }
      } catch (error) {
        console.error('请求失败:', error)
        setError('网络错误，请重试')
      } finally {
        if (!redirecting) {
          setLoading(false)
        }
      }
    })
  }

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // 如果正在加载或跳转，显示加载状态
  if (loading || redirecting) {
    return (
      <div className="bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {redirecting ? '登录成功！' : isLogin ? '正在登录...' : '正在注册...'}
          </h3>
          <p className="text-gray-500">{redirecting ? '正在跳转到主页面，请稍候...' : '请稍候'}</p>
          {redirecting && (
            <div className="mt-4">
              <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                验证通过
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-xl p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{isLogin ? '登录账户' : '创建账户'}</h2>
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
            onChange={(e) => {
              handleInputChange('password', e.target.value)
              const value = e.target.value
              let errorMsg = ''

              if (value.length < 8) {
                errorMsg = '密码长度至少需要8个字符'
              } else if (!/^[a-zA-Z0-9\u4e00-\u9fa5]+$/.test(value)) {
                errorMsg = '密码只能包含字母、数字和中文字符'
              } else if (!/[a-zA-Z]/.test(value)) {
                errorMsg = '密码必须包含至少一个字母'
              }

              setPasswordError(errorMsg)
            }}
            required
            placeholder="请输入密码（8位以上，必须包含字母）"
            className="w-full px-3 py-2 border borsder-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {passwordError && <span className="text-red-500 text-sm mt-1">{passwordError}</span>}
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
            onServiceLevelChange={(level: 'level1' | 'level2' | 'premium') =>
              handleInputChange('serviceLevel', level)
            }
            onEnrolledSubjectsChange={(subjects: string[]) =>
              handleInputChange('enrolledSubjects', subjects)
            }
          />
        )}

        {/* 教师相关字段 */}
        {!isLogin && formData.role === 'teacher' && (
          <TeacherFields
            subjects={formData.subjects || []}
            maxDailyMeetings={formData.maxDailyMeetings || 6}
            bufferMinutes={formData.bufferMinutes || 15}
            onSubjectsChange={(subjects: string[]) => handleInputChange('subjects', subjects)}
            onMaxDailyMeetingsChange={(value: number) =>
              handleInputChange('maxDailyMeetings', value)
            }
            onBufferMinutesChange={(value: number) => handleInputChange('bufferMinutes', value)}
          />
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            <div className="flex items-start">
              <svg
                className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <div className="font-medium">注册失败</div>
                <div className="text-red-600 mt-1">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '处理中...' : isLogin ? '登录' : '注册'}
        </button>

        {/* 切换模式 */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin)
              setError(null)
              setFormData((prev) => ({
                ...prev,
                password: '',
                confirmPassword: '',
                name: '',
                role: 'student',
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
