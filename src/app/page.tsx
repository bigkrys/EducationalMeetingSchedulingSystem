'use client'

import LoginForm from '@/components/auth/LoginForm'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            教育会议调度系统
          </h1>
        </div>

        {/* 登录注册表单 */}
        <LoginForm />
      </div>
    </div>
  )
}
