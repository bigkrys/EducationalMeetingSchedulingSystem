'use client'
import { useEffect } from 'react'

export default function SentryInit() {
  useEffect(() => {
    // 动态引入，保证仅在浏览器执行，避免 SSR 侧去评估该文件
    import('@/sentry.client.config').catch(() => {})
  }, [])
  return null
}
