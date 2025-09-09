// 客户端环境检测器
'use client'

import { useEffect, useState } from 'react'

export default function ClientEnvDetector() {
  const [envInfo, setEnvInfo] = useState<any>(null)

  useEffect(() => {
    const clientEnv = {
      // 所有可用的环境变量（客户端）
      all_env: Object.keys(process.env).filter((key) => key.startsWith('NEXT_PUBLIC_')),

      // Sentry 相关
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ? 'configured' : null,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || null,

      // Vercel 相关
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || null,
      NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL || null,

      // Node 环境
      NODE_ENV: process.env.NODE_ENV || null,

      // 时间戳
      timestamp: new Date().toISOString(),
    }

    setEnvInfo(clientEnv)
  }, [])

  if (!envInfo) return <div>Loading...</div>

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', background: '#f5f5f5' }}>
      <h2>客户端环境变量检测</h2>
      <pre>{JSON.stringify(envInfo, null, 2)}</pre>
    </div>
  )
}
