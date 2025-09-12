'use client'

// 导入Ant Design React兼容性补丁
import '@ant-design/v5-patch-for-react-19'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { incr } from '@/lib/frontend/metrics'
import {
  isAuthenticated,
  getStoredTokens,
  refreshAccessToken,
  clearStoredTokens,
  isTokenExpiringSoon,
} from '@/lib/api/auth'
import { initializeGlobalErrorHandler } from '@/lib/api/global-error-handler'
import { getAuthToken, setAuthToken, clearAuthToken } from '@/lib/frontend/auth'

interface AuthListenerProps {
  children: React.ReactNode
}

const AuthListener: React.FC<AuthListenerProps> = ({ children }) => {
  const router = useRouter()
  const pathname = usePathname()
  const refreshTimeoutRef = useRef<NodeJS.Timeout>()
  const activityTimeoutRef = useRef<NodeJS.Timeout>()
  const lastActivityRef = useRef<number>(Date.now())
  const originalWarnRef = useRef<typeof console.warn | null>(null)

  // 处理用户活动
  const handleUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now()

    // 清除之前的活动超时
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current)
    }

    // 设置新的活动超时（15分钟无操作后跳转登录）
    activityTimeoutRef.current = setTimeout(
      () => {
        if (isAuthenticated()) {
          clearStoredTokens()
          router.push('/')
        }
      },
      15 * 60 * 1000
    ) // 15分钟
  }, [router])

  // 刷新token
  const refreshTokenIfNeeded = useCallback(async () => {
    const { refreshToken } = getStoredTokens()

    if (!refreshToken) {
      clearStoredTokens()
      router.push('/')
      return
    }

    try {
      const newAccessToken = await refreshAccessToken(refreshToken)

      if (newAccessToken) {
        // 更新存储的token
        setAuthToken(newAccessToken)

        // 直接根据新 token 安排下一次刷新（提前5分钟）
        try {
          const decoded = JSON.parse(atob(newAccessToken.split('.')[1]))
          const expirationTime = decoded.exp * 1000
          const currentTime = Date.now()
          const refreshTime = expirationTime - currentTime - 5 * 60 * 1000
          if (refreshTime > 0) {
            refreshTimeoutRef.current = setTimeout(() => {
              // 再次刷新
              refreshTokenIfNeeded()
            }, refreshTime)
          }
        } catch (err) {
          console.error('Failed to parse token after refresh:', err)
        }
      } else {
        // 刷新失败，清除token并跳转登录
        clearStoredTokens()
        router.push('/')
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      clearStoredTokens()
      router.push('/')
    }
  }, [router])

  // 自动刷新token
  const setupTokenRefresh = useCallback(() => {
    const { accessToken, refreshToken } = getStoredTokens()

    if (!accessToken || !refreshToken) {
      return
    }

    // 检查token是否即将过期
    if (isTokenExpiringSoon(accessToken)) {
      refreshTokenIfNeeded()
    } else {
      // 计算下次刷新时间（提前5分钟）
      try {
        const decoded = JSON.parse(atob(accessToken.split('.')[1]))
        const expirationTime = decoded.exp * 1000
        const currentTime = Date.now()
        const refreshTime = expirationTime - currentTime - 5 * 60 * 1000 // 提前5分钟

        if (refreshTime > 0) {
          refreshTimeoutRef.current = setTimeout(() => {
            refreshTokenIfNeeded()
          }, refreshTime)
        }
      } catch (error) {
        console.error('Failed to parse token for refresh timing:', error)
      }
    }
  }, [refreshTokenIfNeeded])

  // 设置事件监听器
  useEffect(() => {
    // 只在客户端运行
    if (typeof window === 'undefined') return

    // 抑制Ant Design React兼容性警告
    if (!originalWarnRef.current) {
      originalWarnRef.current = console.warn
      console.warn = function (...args) {
        const message = args[0]
        if (typeof message === 'string' && message.includes('[antd: compatible]')) {
          // 抑制Ant Design兼容性警告
          return
        }
        if (originalWarnRef.current) {
          originalWarnRef.current.apply(console, args)
        }
      }
    }

    // 初始化全局错误处理器
    try {
      initializeGlobalErrorHandler()
    } catch (error) {
      console.error('全局错误处理器初始化失败:', error)
    }

    // 如果已登录，记录一次会话开始与当前页面浏览
    try {
      if (isAuthenticated()) {
        incr('biz.login.session_start')
        incr('biz.page.view', 1, { page: window.location.pathname })
      }
    } catch {}

    // 使用节流的事件监听，减少性能开销
    let timeoutId: NodeJS.Timeout | null = null
    const throttledHandleUserActivity = () => {
      if (timeoutId) return

      timeoutId = setTimeout(() => {
        handleUserActivity()
        timeoutId = null
      }, 100) // 100ms节流
    }

    // 监听用户活动
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach((event) => {
      document.addEventListener(event, throttledHandleUserActivity, { passive: true })
    })

    // 初始化token刷新
    setupTokenRefresh()

    // 清理函数
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, throttledHandleUserActivity)
      })

      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current)
      }

      // 恢复原始的console.warn
      if (originalWarnRef.current) {
        console.warn = originalWarnRef.current
        originalWarnRef.current = null
      }
    }
  }, [router, handleUserActivity, setupTokenRefresh])

  // 监听路由变化，重新设置token刷新
  useEffect(() => {
    if (typeof window !== 'undefined' && isAuthenticated()) {
      setupTokenRefresh()
    }
    // 记录页面浏览
    if (typeof window !== 'undefined') {
      try {
        incr('biz.page.view', 1, { page: pathname || '/' })
      } catch {}
    }
  }, [router, setupTokenRefresh, pathname])

  return <>{children}</>
}

export default AuthListener
