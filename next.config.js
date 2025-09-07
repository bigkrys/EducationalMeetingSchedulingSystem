/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用图片优化
  images: {
    unoptimized: false,
  },

  // 启用严格模式
  reactStrictMode: true,

  // 配置编译器选项
  compiler: {
    // 在生产环境中移除 console.log
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error'],
          }
        : false,
  },

  // webpack 配置
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // 确保路径解析正确
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    }

    // 忽略 OpenTelemetry/require-in-the-middle 在 dev 下的动态依赖告警
    // 这些告警来自依赖内部的动态 require，用于运行时探测，功能不受影响
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /Critical dependency/ },
    ]

    return config
  },
  // 避免 Next 在 build 时以已弃用的选项调用 ESLint 导致噪音警告
  // 推荐在本地或 CI 上单独运行 `pnpm lint` 来检查/修复问题
  eslint: {
    ignoreDuringBuilds: true,
  },
}
// 使用 Sentry 的 Next.js 集成，在构建时上传 Source Maps 并绑定 Release
// 需要环境变量：SENTRY_AUTH_TOKEN、SENTRY_ORG、SENTRY_PROJECT（仅在构建机可用）
const { withSentryConfig } = require('@sentry/nextjs')

const sentryWebpackPluginOptions = {
  // 读取环境提供的 org/project/authToken；本地未设置时不会上传
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 在本地开发静默处理（不报错）
  silent: true,
  // 自动使用 Vercel 的 VERCEL_GIT_COMMIT_SHA 作为 release（集成会自动处理）
}

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions)
