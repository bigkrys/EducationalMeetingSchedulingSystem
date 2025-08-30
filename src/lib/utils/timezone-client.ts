/**
 * 前端时区处理工具
 * 统一处理UTC时间与本地时间的转换
 */

/**
 * 获取用户的本地时区
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * 将UTC时间转换为本地时间显示
 * @param utcTime UTC时间字符串或Date对象
 * @param options 格式化选项
 * @returns 本地时间字符串
 */
export function formatUtcToLocal(
  utcTime: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getUserTimezone()
  }
  
  return date.toLocaleString('zh-CN', { ...defaultOptions, ...options })
}

/**
 * 只获取时间部分 (HH:mm)
 * @param utcTime UTC时间
 * @returns HH:mm格式的本地时间
 */
export function getLocalTimeOnly(utcTime: string | Date): string {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: getUserTimezone()
  })
}

/**
 * 只获取日期部分 (YYYY-MM-DD)
 * @param utcTime UTC时间
 * @returns YYYY-MM-DD格式的本地日期
 */
export function getLocalDateOnly(utcTime: string | Date): string {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: getUserTimezone() }))
  return localDate.toISOString().split('T')[0]
}

/**
 * 将本地时间转换为UTC时间（用于提交到后端）
 * @param localDateTime 本地时间字符串 (YYYY-MM-DDTHH:mm 或 YYYY-MM-DD HH:mm)
 * @returns UTC时间的ISO字符串
 */
export function convertLocalToUtc(localDateTime: string): string {
  // 处理不同的输入格式
  const dateTimeString = localDateTime.includes('T') 
    ? localDateTime 
    : localDateTime.replace(' ', 'T')
  
  // 确保有秒的部分
  const fullDateTime = dateTimeString.includes(':00', dateTimeString.lastIndexOf(':')) 
    ? dateTimeString 
    : dateTimeString + ':00'
  
  // 创建一个临时的Date对象，假设输入是本地时间
  const tempDate = new Date(fullDateTime)
  
  // 获取本地时区偏移量（分钟）
  const timezoneOffset = tempDate.getTimezoneOffset()
  
  // 调整为UTC时间
  const utcTime = new Date(tempDate.getTime() + timezoneOffset * 60000)
  
  return utcTime.toISOString()
}

/**
 * 创建基于当前用户时区的今天日期的UTC时间
 * @param timeString 时间字符串 "HH:mm"
 * @param dateString 可选的日期字符串 "YYYY-MM-DD"，默认今天
 * @returns UTC时间的ISO字符串
 */
export function createUtcDateTime(timeString: string, dateString?: string): string {
  const today = dateString || new Date().toISOString().split('T')[0]
  const localDateTime = `${today}T${timeString}`
  return convertLocalToUtc(localDateTime)
}

/**
 * 检查UTC时间是否在今天（按用户本地时区）
 * @param utcTime UTC时间
 * @returns 是否是今天
 */
export function isToday(utcTime: string | Date): boolean {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime
  const localToday = new Date().toDateString()
  const targetLocalDate = new Date(date.toLocaleString('en-US', { timeZone: getUserTimezone() })).toDateString()
  return localToday === targetLocalDate
}

/**
 * 获取相对时间描述
 * @param utcTime UTC时间
 * @returns 相对时间描述，如 "2小时后"、"昨天"等
 */
export function getRelativeTime(utcTime: string | Date): string {
  const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  
  if (Math.abs(diffHours) < 1) {
    const diffMinutes = Math.round(diffMs / (1000 * 60))
    if (diffMinutes > 0) {
      return `${diffMinutes}分钟后`
    } else if (diffMinutes < 0) {
      return `${Math.abs(diffMinutes)}分钟前`
    } else {
      return '现在'
    }
  } else if (Math.abs(diffHours) < 24) {
    if (diffHours > 0) {
      return `${diffHours}小时后`
    } else {
      return `${Math.abs(diffHours)}小时前`
    }
  } else if (Math.abs(diffDays) < 7) {
    if (diffDays > 0) {
      return `${diffDays}天后`
    } else if (diffDays === -1) {
      return '昨天'
    } else if (diffDays === 1) {
      return '明天'
    } else {
      return `${Math.abs(diffDays)}天前`
    }
  } else {
    return formatUtcToLocal(date, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

/**
 * 时区信息显示
 */
export function getTimezoneInfo(): {
  timezone: string
  offset: string
  name: string
} {
  const timezone = getUserTimezone()
  const now = new Date()
  const offset = -now.getTimezoneOffset() / 60
  const offsetString = `UTC${offset >= 0 ? '+' : ''}${offset}`
  
  // 获取时区名称
  const name = now.toLocaleString('zh-CN', {
    timeZoneName: 'long',
    timeZone: timezone
  }).split(' ').pop() || timezone
  
  return {
    timezone,
    offset: offsetString,
    name
  }
}
