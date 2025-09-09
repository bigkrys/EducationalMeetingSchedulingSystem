'use client'
import { useEffect } from 'react'
import { onCLS, onINP, onLCP, onTTFB, onFCP, type Metric } from 'web-vitals'
import * as Sentry from '@sentry/nextjs'
import { usePathname } from 'next/navigation'

function reportMetric(name: string, m: Metric, page: string) {
  // 将指标值作为分布上报；LCP/INP/TTFB/FCP 为毫秒，CLS 为无量纲
  const value = m.name === 'CLS' ? m.value : m.value
  const tags = { page, id: m.id } as Record<string, string>
  try {
    if (m.name === 'CLS') {
      Sentry.metrics.distribution(`web_vitals_${name.toLowerCase()}`, value, { tags })
    } else {
      // 以毫秒为单位上报（名称带 `_ms` 后缀便于识别）
      Sentry.metrics.distribution(`web_vitals_${name.toLowerCase()}_ms`, value, { tags })
    }
  } catch {}
}

export default function WebVitalsReporter() {
  const page = usePathname() || '/'

  useEffect(() => {
    onLCP((m) => reportMetric('LCP', m, page))
    onINP((m) => reportMetric('INP', m, page))
    onCLS((m) => reportMetric('CLS', m, page))
    onTTFB((m) => reportMetric('TTFB', m, page))
    onFCP((m) => reportMetric('FCP', m, page))
  }, [page])

  return null
}
