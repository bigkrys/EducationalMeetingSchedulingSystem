"use client"

import React from 'react'
import { usePathname } from 'next/navigation'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname()

  return (
    <html>
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', background: '#fafafa' }}>
        <div style={{ maxWidth: 720, margin: '80px auto', padding: 24, background: '#fff', borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>抱歉，页面出现错误</h1>
          <p style={{ color: '#666' }}>路径：{pathname}</p>
          <p style={{ color: '#666' }}>时间：{new Date().toLocaleString()}</p>
          {error?.digest && (
            <p style={{ color: '#999', fontSize: 12 }}>错误标识：{error.digest}</p>
          )}
          <div style={{ marginTop: 12, color: '#444' }}>
            <p>请稍后重试，或返回首页。在需要协助时可提供页面时间与错误标识便于排查。</p>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button onClick={() => reset()} style={{ padding: '8px 16px', background: '#1677ff', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>重试</button>
            <a href="/" style={{ padding: '8px 16px', background: '#f0f0f0', color: '#333', borderRadius: 6, textDecoration: 'none' }}>返回首页</a>
          </div>
          <details style={{ marginTop: 20, color: '#777' }}>
            <summary>错误详情（开发用）</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{String(error?.stack || error?.message || '')}</pre>
          </details>
        </div>
      </body>
    </html>
  )
}

