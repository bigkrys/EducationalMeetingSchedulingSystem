'use client'
import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'

type SentryConfig = { dsn: string; environment: string; tunnel?: string }

export default function SentryDebugPage() {
  const [cfg, setCfg] = useState<SentryConfig | null>(null)
  const [inited, setInited] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // 通过服务端接口获取配置，避免在前端硬编码环境变量
    fetch('/api/sentry/config')
      .then((r) => r.json())
      .then((json: SentryConfig) => {
        setCfg(json)
        if (json?.dsn) {
          Sentry.init({ dsn: json.dsn, environment: json.environment, tunnel: json.tunnel })
          setInited(true)
        } else {
          setErr('运行时缺少 SENTRY_DSN')
        }
      })
      .catch((e) => setErr(String(e)))
  }, [])

  const triggerClientError = () => {
    throw new Error('Sentry client debug error')
  }

  const captureMessage = () => {
    Sentry.captureMessage('sentry client debug message', {
      level: 'info',
      tags: { source: 'client-debug' },
    })
  }

  const manualTransaction = async () => {
    await Sentry.startSpan({ name: 'client manual flow', op: 'ui.action' }, async () => {
      await Sentry.startSpan({ name: 'prepare data', op: 'task' }, async () => {
        await new Promise((r) => setTimeout(r, 120))
      })
      await Sentry.startSpan({ name: 'fake network', op: 'http.client' }, async () => {
        await new Promise((r) => setTimeout(r, 200))
      })
    })
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Sentry Client Debug</h1>
      <p>Init: {inited ? 'initialized' : 'not initialized'}</p>
      {cfg && (
        <pre style={{ background: '#f6f6f6', padding: 12 }}>
          {JSON.stringify({ environment: cfg.environment, dsnPresent: Boolean(cfg.dsn) }, null, 2)}
        </pre>
      )}
      {err && <p style={{ color: '#c00' }}>Error: {err}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button onClick={captureMessage} style={{ padding: '8px 12px', border: '1px solid #bbb' }}>
          Send Client Message
        </button>
        <button
          onClick={triggerClientError}
          style={{ padding: '8px 12px', border: '1px solid #bbb' }}
        >
          Throw Client Error
        </button>
        <button
          onClick={manualTransaction}
          style={{ padding: '8px 12px', border: '1px solid #bbb' }}
        >
          Send Manual Transaction
        </button>
      </div>

      <p style={{ marginTop: 16 }}>
        服务器调试端点：<code>/api/sentry/debug</code>（访问即可发送一条服务端事件）
      </p>
    </div>
  )
}
