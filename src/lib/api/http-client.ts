// 通用的HTTP客户端，自动添加token到请求头
// 支持全局错误拦截和消息提示
import { getFriendlyErrorMessage } from '@/lib/frontend/error-messages'
import { getAuthToken, setAuthToken, clearAuthToken } from '@/lib/frontend/auth'
import { storeTokens, clearStoredTokens, getStoredTokens } from '@/lib/api/auth'
export class ApiClient {
  // 全局错误处理开关
  private static globalErrorHandling = true

  // 错误消息显示器（需要在客户端设置）
  private static messageHandler:
    | ((type: 'success' | 'error' | 'warning' | 'info', content: string) => void)
    | null = null

  // 设置消息处理器
  static setMessageHandler(
    handler: (type: 'success' | 'error' | 'warning' | 'info', content: string) => void
  ) {
    this.messageHandler = handler
  }

  // 设置全局错误处理
  static setGlobalErrorHandling(enabled: boolean) {
    this.globalErrorHandling = enabled
  }

  // 显示错误消息
  private static showError(message: string) {
    if (this.messageHandler && this.globalErrorHandling) {
      this.messageHandler('error', message)
    } else if (typeof window !== 'undefined') {
      console.error('API Error:', message)
    }
  }

  // 显示成功消息
  private static showSuccess(message: string) {
    if (this.messageHandler && this.globalErrorHandling) {
      this.messageHandler('success', message)
    }
  }

  // 解析错误响应
  private static async parseErrorResponse(response: Response): Promise<string> {
    try {
      const errorData = await response.json()
      // 优先按后端返回的 code 映射友好文案
      const friendly = getFriendlyErrorMessage({
        code: errorData?.code ?? errorData?.error,
        message: errorData?.message,
      })
      if (friendly) return friendly

      // 根据不同的HTTP状态码返回默认的友好错误消息
      switch (response.status) {
        case 400:
          return '请求参数错误，请检查输入信息'
        case 401:
          return '认证失败，请重新登录'
        case 403:
          return '权限不足，无法执行此操作'
        case 404:
          return '请求的资源不存在'
        case 409:
          return '操作冲突，请检查数据状态'
        case 422:
          return '数据验证失败，请检查输入'
        case 429:
          return '请求过于频繁，请稍后再试'
        case 500:
          return '服务器内部错误，请稍后重试'
        case 502:
        case 503:
        case 504:
          return '服务暂时不可用，请稍后重试'
        default:
          return `请求失败 (${response.status})`
      }
    } catch (e) {
      return `网络错误 (${response.status})`
    }
  }
  private static getAuthHeaders(): HeadersInit {
    // Cookie-based auth: no Authorization header needed
    return { 'Content-Type': 'application/json' }
  }

  static async get(url: string): Promise<Response> {
    return this.authenticatedRequest(url, { method: 'GET' })
  }

  static async post(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  static async put(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  static async patch(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  static async delete(url: string): Promise<Response> {
    return this.authenticatedRequest(url, { method: 'DELETE' })
  }

  // 带认证的请求，如果token过期会自动刷新，并处理错误
  static async authenticatedRequest(
    url: string,
    options: RequestInit = {},
    skipErrorHandling = false
  ): Promise<Response> {
    try {
      // Compose headers with Authorization if present
      const headers = {
        ...this.getAuthHeaders(),
        ...(options.headers || {}),
      } as HeadersInit

      const init: RequestInit = { ...options, headers }
      let res = await fetch(url, init)

      if (res.status === 401) {
        // 尝试刷新 accessToken 并重试
        try {
          // 仅依赖 HttpOnly refresh cookie
          const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' })
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json().catch(() => null)
            if (refreshData?.accessToken) {
              setAuthToken(refreshData.accessToken)
              // 使用新 token 重试
              const retryHeaders = {
                ...this.getAuthHeaders(),
                ...(options.headers || {}),
              } as HeadersInit
              res = await fetch(url, { ...options, headers: retryHeaders })
            }
          }
        } catch {
          // ignore
        }

        // 若仍未通过认证，清理并提示
        if (res.status === 401) {
          clearAuthToken()
          try {
            clearStoredTokens()
          } catch (_) {}
          this.showError('登录已过期，请重新登录')
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              window.location.href = '/'
            }, 1500)
          }
        }
      }

      // 处理其他HTTP错误（保留响应体给调用方）
      if (!res.ok && !skipErrorHandling) {
        const clone = res.clone()
        const errorMessage = await this.parseErrorResponse(clone)
        this.showError(errorMessage)
      }

      return res
    } catch (error) {
      if (!skipErrorHandling) {
        this.showError('网络连接失败，请检查网络设置')
      }
      throw error
    }
  }
}

// 便捷的API调用函数
export const api = {
  get: (url: string) => ApiClient.get(url),
  post: (url: string, data?: any) => ApiClient.post(url, data),
  put: (url: string, data?: any) => ApiClient.put(url, data),
  patch: (url: string, data?: any) => ApiClient.patch(url, data),
  delete: (url: string) => ApiClient.delete(url),
  auth: (url: string, options?: RequestInit) => ApiClient.authenticatedRequest(url, options),
}

// 为了兼容现有的页面组件导入，添加httpClient导出
export const httpClient = {
  get: (url: string) => ApiClient.get(url),
  post: (url: string, data?: any) => ApiClient.post(url, data),
  put: (url: string, data?: any) => ApiClient.put(url, data),
  patch: (url: string, data?: any) => ApiClient.patch(url, data),
  delete: (url: string) => ApiClient.delete(url),
  authenticatedRequest: (url: string, options?: RequestInit) =>
    ApiClient.authenticatedRequest(url, options),
}
