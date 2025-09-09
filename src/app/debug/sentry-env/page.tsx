import ClientEnvDetector from '@/components/debug/ClientEnvDetector'

export default function SentryEnvDebugPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Sentry 环境调试页面</h1>
      <p>此页面用于调试 Sentry 环境变量配置问题</p>

      <div style={{ marginBottom: '20px' }}>
        <h2>服务端 API 检测</h2>
        <p>
          <a href="/api/debug/sentry-env" target="_blank" rel="noopener noreferrer">
            查看服务端环境变量 →
          </a>
        </p>
      </div>

      <ClientEnvDetector />
    </div>
  )
}
