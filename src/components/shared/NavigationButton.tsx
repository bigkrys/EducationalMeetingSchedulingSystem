'use client'

import { useState } from 'react'
import { Button, Spin } from 'antd'
import { useRouter } from 'next/navigation'
import type { ButtonProps } from 'antd'

interface NavigationButtonProps extends ButtonProps {
  href: string
  children: React.ReactNode
  loadingText?: string
}

export default function NavigationButton({
  href,
  children,
  loadingText = '跳转中...',
  ...buttonProps
}: NavigationButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleClick = () => {
    setLoading(true)

    // 添加轻微延迟以显示loading状态
    setTimeout(() => {
      router.push(href)
      // 路由完成后停止loading（Next.js会自动处理页面切换）
      setTimeout(() => setLoading(false), 100)
    }, 50)
  }

  return (
    <Button {...buttonProps} onClick={handleClick} disabled={loading || buttonProps.disabled}>
      {loading ? (
        <>
          <Spin size="small" />
          <span style={{ marginLeft: 8 }}>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </Button>
  )
}
