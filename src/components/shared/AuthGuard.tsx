'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageLoader from '@/components/shared/PageLoader'
import { isAuthenticated, getCurrentUserId, getCurrentUserRole } from '@/lib/api/auth'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: 'student' | 'teacher' | 'admin'
  redirectTo?: string
}

export default function AuthGuard({ children, requiredRole, redirectTo = '/' }: AuthGuardProps) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 检查基本认证状态
        if (!isAuthenticated()) {
          router.push(redirectTo)
          return
        }

        // 如果需要特定角色，检查角色权限
        if (requiredRole) {
          const userRole = getCurrentUserRole()
          if (!userRole || userRole !== requiredRole) {
            // 角色不匹配，跳转到主控制台
            router.push('/dashboard')
            return
          }
        }

        setAuthorized(true)
      } catch (error) {
        console.error('Auth check failed:', error)
        router.push(redirectTo)
      } finally {
        setChecking(false)
      }
    }

    checkAuth()
  }, [router, requiredRole, redirectTo])

  if (checking) {
    return <PageLoader message="正在验证权限" description="请稍候，正在检查您的访问权限..." />
  }

  if (!authorized) {
    return <PageLoader message="重定向中" description="正在跳转到适当的页面..." />
  }

  return <>{children}</>
}

// 特定角色的便捷组件
export function StudentGuard({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="student">{children}</AuthGuard>
}

export function TeacherGuard({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="teacher">{children}</AuthGuard>
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="admin">{children}</AuthGuard>
}
