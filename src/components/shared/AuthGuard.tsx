'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageLoader from '@/components/shared/PageLoader'
import { useSession } from '@/lib/frontend/useSession'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: 'student' | 'teacher' | 'admin'
  redirectTo?: string
}

export default function AuthGuard({ children, requiredRole, redirectTo = '/' }: AuthGuardProps) {
  const router = useRouter()
  const { data, loading } = useSession()

  const loggedIn = !!data?.loggedIn
  const role = data?.user?.role as 'student' | 'teacher' | 'admin' | 'superadmin' | undefined
  const roleOk =
    !requiredRole || role === requiredRole || (requiredRole === 'admin' && role === 'superadmin')

  useEffect(() => {
    if (loading) return
    if (!loggedIn) {
      router.replace(redirectTo)
      return
    }
    if (!roleOk) {
      router.replace('/dashboard')
    }
  }, [loading, loggedIn, roleOk, router, redirectTo])

  if (loading) {
    return <PageLoader message="正在验证权限" description="请稍候，正在检查您的访问权限..." />
  }
  if (!loggedIn) {
    return <PageLoader message="未登录" description="正在跳转到登录页面" />
  }
  if (!roleOk) {
    return <PageLoader message="权限不足" description="正在跳转到控制台" />
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
