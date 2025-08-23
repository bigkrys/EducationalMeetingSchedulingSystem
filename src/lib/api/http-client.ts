// 通用的HTTP客户端，自动添加token到请求头
export class ApiClient {
  private static getAuthHeaders(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    return headers
  }

  static async get(url: string): Promise<Response> {
    return this.authenticatedRequest(url, { method: 'GET' })
  }

  static async post(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  static async put(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  static async patch(url: string, data?: any): Promise<Response> {
    return this.authenticatedRequest(url, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  static async delete(url: string): Promise<Response> {
    return this.authenticatedRequest(url, { method: 'DELETE' })
  }

  // 带认证的请求，如果token过期会自动刷新
  static async authenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = this.getAuthHeaders()
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    })

    // 如果返回401，可能是token过期，尝试刷新
    if (response.status === 401) {
      console.log('Token expired, attempting refresh...')
      
      try {
        // 尝试刷新token
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            localStorage.setItem('accessToken', refreshData.accessToken)
            if (refreshData.refreshToken) {
              localStorage.setItem('refreshToken', refreshData.refreshToken)
            }
            
            console.log('Token refreshed successfully, retrying request...')
            
            // 使用新token重试原请求
            const newHeaders = this.getAuthHeaders()
            return fetch(url, {
              ...options,
              headers: {
                ...newHeaders,
                ...options.headers
              }
            })
          } else {
            console.log('Token refresh failed, redirecting to login...')
          }
        }
      } catch (error) {
        console.error('Token refresh error:', error)
      }
      
      // 刷新失败，清除token并重定向到登录页
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      if (typeof window !== 'undefined') {
        window.location.href = '/'
      }
    }

    return response
  }
}

// 便捷的API调用函数
export const api = {
  get: (url: string) => ApiClient.get(url),
  post: (url: string, data?: any) => ApiClient.post(url, data),
  put: (url: string, data?: any) => ApiClient.put(url, data),
  patch: (url: string, data?: any) => ApiClient.patch(url, data),
  delete: (url: string) => ApiClient.delete(url),
  auth: (url: string, options?: RequestInit) => ApiClient.authenticatedRequest(url, options)
}

// 为了兼容现有的页面组件导入，添加httpClient导出
export const httpClient = {
  get: (url: string) => ApiClient.get(url),
  post: (url: string, data?: any) => ApiClient.post(url, data),
  put: (url: string, data?: any) => ApiClient.put(url, data),
  patch: (url: string, data?: any) => ApiClient.patch(url, data),
  delete: (url: string) => ApiClient.delete(url),
  authenticatedRequest: (url: string, options?: RequestInit) => ApiClient.authenticatedRequest(url, options)
}
