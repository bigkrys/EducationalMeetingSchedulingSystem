/**
 * Sentry 环境判断工具函数
 * 正确识别 Vercel 环境并返回对应的 Sentry 环境名称
 */

export function getSentryEnvironment(): string {
  // 如果明确设置了 SENTRY_ENVIRONMENT，直接使用
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT
  }

  // 在 Vercel 环境中，使用 VERCEL_ENV 来判断
  if (process.env.VERCEL_ENV) {
    switch (process.env.VERCEL_ENV) {
      case 'production':
        return 'production'
      case 'preview':
        return 'preview'
      case 'development':
        return 'development'
      default:
        return process.env.VERCEL_ENV
    }
  }

  // 回退到 NODE_ENV
  return process.env.NODE_ENV || 'development'
}
