'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { 
  isAuthenticated, 
  getStoredTokens, 
  refreshAccessToken, 
  clearStoredTokens,
  isTokenExpiringSoon 
} from '@/lib/api/auth'

interface AuthListenerProps {
  children: React.ReactNode
}

const AuthListener: React.FC<AuthListenerProps> = ({ children }) => {
  const router = useRouter()
  const refreshTimeoutRef = useRef<NodeJS.Timeout>()
  const activityTimeoutRef = useRef<NodeJS.Timeout>()
  const lastActivityRef = useRef<number>(Date.now())

  // 处理用户活动
  const handleUserActivity = () => {
    lastActivityRef.current = Date.now()
    
    // 清除之前的活动超时
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current)
    }
    
    // 设置新的活动超时（15分钟无操作后跳转登录）
    activityTimeoutRef.current = setTimeout(() => {
      if (isAuthenticated()) {
        clearStoredTokens()
        router.push('/')
      }
    }, 15 * 60 * 1000) // 15分钟
  }

  // 自动刷新token
  const setupTokenRefresh = () => {
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
        const refreshTime = expirationTime - currentTime - (5 * 60 * 1000) // 提前5分钟
        
        if (refreshTime > 0) {
          refreshTimeoutRef.current = setTimeout(() => {
            refreshTokenIfNeeded()
          }, refreshTime)
        }
      } catch (error) {
        console.error('Failed to parse token for refresh timing:', error)
      }
    }
  }

  // 刷新token
  const refreshTokenIfNeeded = async () => {
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
        localStorage.setItem('accessToken', newAccessToken)
        
        // 设置下次刷新
        setupTokenRefresh()
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
  }

  // 设置事件监听器
  useEffect(() => {
    // 只在客户端运行
    if (typeof window === 'undefined') return

    // 使用节流的事件监听，减少性能开销
    let timeoutId: NodeJS.Timeout | null = null
    const throttledHandleUserActivity = (event: Event) => {
      if (timeoutId) return
      
      timeoutId = setTimeout(() => {
        handleUserActivity()
        timeoutId = null
      }, 100) // 100ms节流
    }

    // 监听用户活动
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach(event => {
      document.addEventListener(event, throttledHandleUserActivity, { passive: true })
    })

    // 初始化token刷新
    setupTokenRefresh()

    // 清理函数
    return () => {
      events.forEach(event => {
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
    }
  }, [router])

  // 监听路由变化，重新设置token刷新
  useEffect(() => {
    if (typeof window !== 'undefined' && isAuthenticated()) {
      setupTokenRefresh()
    }
  }, [router])

  return <>{children}</>
}

export default AuthListener
