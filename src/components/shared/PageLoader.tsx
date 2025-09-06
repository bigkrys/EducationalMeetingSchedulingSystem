'use client'

import React from 'react'

interface PageLoaderProps {
  message?: string
  description?: string
}

export default function PageLoader({
  message = '正在加载...',
  description = '请稍候，页面正在准备中',
}: PageLoaderProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center">
          {/* 加载动画 */}
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>

          {/* 主标题 */}
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{message}</h3>

          {/* 描述信息 */}
          <p className="text-gray-500 mb-6">{description}</p>

          {/* 进度条 */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full animate-pulse"
              style={{ width: '60%' }}
            ></div>
          </div>

          {/* 提示文字 */}
          <div className="text-sm text-gray-400">
            <p>系统正在初始化组件...</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 简化版本的加载器
export function SimpleLoader({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

// 页面级别的骨架屏
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* 顶部导航骨架 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="w-32 h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-20 h-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* 主要内容骨架 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-6">
              <div className="w-16 h-16 bg-gray-200 rounded-lg mb-4 animate-pulse"></div>
              <div className="w-24 h-4 bg-gray-200 rounded mb-2 animate-pulse"></div>
              <div className="w-16 h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* 表格骨架 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="w-32 h-6 bg-gray-200 rounded mb-4 animate-pulse"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="w-40 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-24 h-3 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="w-20 h-6 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
