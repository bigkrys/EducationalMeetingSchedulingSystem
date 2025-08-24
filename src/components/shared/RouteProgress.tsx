'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Spin } from 'antd'

export default function RouteProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [prevPathname, setPrevPathname] = useState(pathname)

  useEffect(() => {
    if (pathname !== prevPathname) {
      setLoading(true)
      setPrevPathname(pathname)
      
      // 模拟路由加载时间
      const timer = setTimeout(() => {
        setLoading(false)
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [pathname, prevPathname])

  if (!loading) return null

  return (
    <div className="fixed top-0 left-0 w-full h-1 bg-gray-200 z-50">
      <div className="h-full bg-blue-500 animate-pulse"></div>
      
    </div>
  )
}
