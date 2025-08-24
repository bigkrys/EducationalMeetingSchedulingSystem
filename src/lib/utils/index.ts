import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind CSS 类名合并工具
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 日期时间工具函数
export function formatDate(date: Date | string, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = new Date(date)
  
  switch (format) {
    case 'short':
      return d.toLocaleDateString('zh-CN')
    case 'long':
      return d.toLocaleDateString('zh-CN', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    case 'iso':
      return d.toISOString()
    default:
      return d.toLocaleDateString('zh-CN')
  }
}

export function formatTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// 时间计算工具
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600000)
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString()
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function isFuture(date: Date): boolean {
  return date > new Date()
}

export function isPast(date: Date): boolean {
  return date < new Date()
}

// 数组工具函数
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

export function sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    
    if (aVal < bVal) return order === 'asc' ? -1 : 1
    if (aVal > bVal) return order === 'asc' ? 1 : -1
    return 0
  })
}

// 字符串工具函数
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// 验证工具函数
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPassword(password: string): boolean {
  // 至少8位，包含大小写字母和数字
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
  return passwordRegex.test(password)
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
}

// 数字工具函数
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals)
}

export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max)
}

export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 对象工具函数
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key]
    }
  })
  return result
}

export function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  keys.forEach(key => {
    delete result[key]
  })
  return result
}

// 本地存储工具函数
export function setLocalStorage(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to set localStorage:', error)
  }
}

export function getLocalStorage<T>(key: string, defaultValue?: T): T | null {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue || null
  } catch (error) {
    console.error('Failed to get localStorage:', error)
    return defaultValue || null
  }
}

export function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to remove localStorage:', error)
  }
}

// 防抖和节流工具函数
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// 错误处理工具函数
export function handleError(error: any, context?: string): void {
  console.error(`Error${context ? ` in ${context}` : ''}:`, error)
  
  // 这里可以添加错误上报逻辑
  // 比如发送到错误监控服务
}

// 生成唯一ID
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
