export type AppEnv = 'development' | 'preview' | 'staging' | 'production'
export type FeatureName = 'teacherRadar'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = name + '='
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const s = part.trim()
    if (s.startsWith(prefix)) return decodeURIComponent(s.slice(prefix.length))
  }
  return null
}

export function getAppEnv(): AppEnv {
  const env = (process.env.NEXT_PUBLIC_APP_ENV || '').toLowerCase()
  if (env === 'development' || env === 'preview' || env === 'staging' || env === 'production')
    return env as AppEnv

  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase()
  if (vercelEnv === 'production') return 'production'
  if (vercelEnv === 'preview') {
    const prId = (process.env.VERCEL_GIT_PULL_REQUEST_ID || '').toString()
    const ref = (process.env.VERCEL_GIT_COMMIT_REF || '').toLowerCase()
    // develop branch preview serves as staging; PRs/others are preview
    if (!prId && ref === 'develop') return 'staging'
    return 'preview'
  }
  if (vercelEnv === 'development') return 'development'

  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export function isCanaryRelease(): boolean {
  const cookie = getCookie('edu_release')
  if (!cookie) {
    return false
  }
  const variant = cookie.split(':')[0]
  return variant === 'canary'
}

export function isFeatureEnabled(name: FeatureName): boolean {
  const appEnv = getAppEnv()
  switch (name) {
    case 'teacherRadar':
      if (appEnv === 'development' || appEnv === 'preview' || appEnv === 'staging') return true
      return isCanaryRelease()
    default:
      return false
  }
}

export function useFeature(name: FeatureName): boolean {
  return isFeatureEnabled(name)
}
