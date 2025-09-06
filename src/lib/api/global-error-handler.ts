'use client'

import { message } from 'antd'
import { ApiClient } from './http-client'
import { getFriendlyErrorMessage } from '@/lib/frontend/error-messages'

const GLOBAL_MESSAGE_KEY = 'GLOBAL_MESSAGE'
let lastContent = ''
let lastShownAt = 0

function openMessage(type: 'success' | 'error' | 'warning' | 'info', input: any) {
  // 兼容字符串或后端 payload
  let display = ''
  try {
    if (typeof input === 'string') {
      // 尝试解析 JSON
      if (input.startsWith('{') || input.startsWith('[')) {
        const payload = JSON.parse(input)
        display = getFriendlyErrorMessage({
          code: payload?.code ?? payload?.error,
          message: payload?.message,
        })
      } else {
        display = input
      }
    } else {
      display = getFriendlyErrorMessage({
        code: input?.code ?? input?.error,
        message: input?.message,
      })
    }
  } catch {
    display = typeof input === 'string' ? input : input?.message || '操作失败'
  }

  // 去抖：短时间内重复信息不再次弹出
  const now = Date.now()
  if (display === lastContent && now - lastShownAt < 800) return
  lastContent = display
  lastShownAt = now

  message.open({ type, content: display, key: GLOBAL_MESSAGE_KEY })
}

// 初始化全局错误处理器
export function initializeGlobalErrorHandler() {
  // 设置Ant Design的message作为全局消息处理器
  ApiClient.setMessageHandler((type, content) => {
    openMessage(type, content)
  })

  // 配置Ant Design message的全局设置
  message.config({
    top: 100,
    duration: 4,
    maxCount: 1,
    rtl: false,
  })
}

// 临时禁用全局错误处理（用于特殊情况）
export function disableGlobalErrorHandling() {
  ApiClient.setGlobalErrorHandling(false)
}

// 重新启用全局错误处理
export function enableGlobalErrorHandling() {
  ApiClient.setGlobalErrorHandling(true)
}

// 手动显示错误消息（用于自定义错误处理）
export function showErrorMessage(content: string) {
  openMessage('error', content)
}

// 手动显示成功消息
export function showSuccessMessage(content: string) {
  openMessage('success', content)
}

// 手动显示警告消息
export function showWarningMessage(content: string) {
  openMessage('warning', content)
}

// 手动显示信息消息
export function showInfoMessage(content: string) {
  openMessage('info', content)
}

// 供业务处按 payload 调用，避免手工拼接字符串
export function showApiError(payload: { code?: string; error?: string; message?: string }) {
  openMessage('error', payload)
}
