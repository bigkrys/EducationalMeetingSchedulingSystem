'use client'

import React from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleProvider, createCache, extractStyle } from '@ant-design/cssinjs'

export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode
}) {
  const cache = React.useMemo(() => createCache(), [])
  
  useServerInsertedHTML(() => {
    const style = extractStyle(cache, true)
    if (!style) return null
    
    return (
      <style
        id="antd-style"
        dangerouslySetInnerHTML={{
          __html: style,
        }}
      />
    )
  })
  
  return (
    <StyleProvider cache={cache}>
      {children}
    </StyleProvider>
  )
}
