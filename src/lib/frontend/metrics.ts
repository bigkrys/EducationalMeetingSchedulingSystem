'use client'
import * as Sentry from '@sentry/nextjs'

export function incr(name: string, by = 1, tags?: Record<string, string | number | boolean>) {
  try {
    const stringTags = Object.fromEntries(
      Object.entries(tags || {}).map(([k, v]) => [k, String(v)])
    ) as Record<string, string>
    Sentry.metrics.increment(name, by, { tags: stringTags })
  } catch {}
}
