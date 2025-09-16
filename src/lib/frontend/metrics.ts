'use client'

import * as Sentry from '@sentry/nextjs'
import { track } from '@vercel/analytics'

type MetricTags = Record<string, string | number | boolean | null | undefined>

function serializeTags(tags?: MetricTags): Record<string, string> {
  const entries = Object.entries(tags || {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value as string | number | boolean | null)])
  return Object.fromEntries(entries) as Record<string, string>
}

function getReleaseProperties(): Record<string, string | null> {
  if (typeof document === 'undefined') return {}
  try {
    const cookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('edu_release='))
    if (!cookie) return {}
    const rawValue = cookie.split('=').slice(1).join('=')
    const decoded = decodeURIComponent(rawValue)
    const [channel, releaseId] = decoded.split(':')
    return {
      releaseChannel: channel || null,
      releaseId: releaseId || null,
    }
  } catch (error) {
    console.warn('Failed to read release cookies for analytics', error)
    return {}
  }
}

export function incr(name: string, by = 1, tags?: MetricTags) {
  const serializedTags = serializeTags(tags)

  try {
    Sentry.metrics.increment(name, by, { tags: serializedTags })
  } catch {}

  try {
    const properties: Record<string, string | number | boolean | null> = {
      count: by,
      ...getReleaseProperties(),
    }

    for (const [key, value] of Object.entries(tags || {})) {
      if (value === undefined) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        properties[key] = value
      } else if (value === null) {
        properties[key] = null
      } else {
        properties[key] = String(value)
      }
    }

    track(name, properties)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[analytics] failed to track event', error)
    }
  }
}
