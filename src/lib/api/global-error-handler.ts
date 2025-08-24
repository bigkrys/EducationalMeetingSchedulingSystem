'use client'

import { message } from 'antd'
import { ApiClient } from './http-client'

// 初始化全局错误处理器
export function initializeGlobalErrorHandler() {
  // 设置Ant Design的message作为全局消息处理器
  ApiClient.setMessageHandler((type, content) => {
    switch (type) {
      case 'error':
        message.error(content)
        break
      case 'success':
        message.success(content)
        break
      case 'warning':
        message.warning(content)
        break
      case 'info':
        message.info(content)
        break
      default:
        message.info(content)
    }
  })

  // 配置Ant Design message的全局设置
  message.config({
    top: 100,
    duration: 4,
    maxCount: 3,
    rtl: false,
  })

  console.log('✅ 全局API错误处理器已初始化')
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
  message.error(content)
}

// 手动显示成功消息
export function showSuccessMessage(content: string) {
  message.success(content)
}

// 手动显示警告消息
export function showWarningMessage(content: string) {
  message.warning(content)
}

// 手动显示信息消息
export function showInfoMessage(content: string) {
  message.info(content)
}
