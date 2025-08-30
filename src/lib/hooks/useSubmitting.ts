import { useState, useCallback } from 'react'

/**
 * Simple hook to manage a submitting/loading flag and provide a wrapper to
 * execute async actions with automatic flag management to prevent double submit.
 */
export default function useSubmitting(initial = false) {
  const [submitting, setSubmitting] = useState<boolean>(initial)

  const wrap = useCallback(
    async (fn: () => Promise<void> | void) => {
      if (submitting) return
      try {
        setSubmitting(true)
        // allow fn to be sync or async
        const r = fn()
        if (r && typeof (r as any).then === 'function') {
          await (r as Promise<void>)
        }
      } finally {
        setSubmitting(false)
      }
    },
    [submitting]
  )

  return { submitting, setSubmitting, wrap }
}
