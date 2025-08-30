// 系统常量
// 将常用时间常量导出为顶层常量，便于从其他模块直接导入使用
export const DEFAULT_EXPIRE_HOURS = 48 // 小时
export const DEFAULT_BUFFER_MINUTES = 15 // 分钟

export const SYSTEM_CONSTANTS = {
  // 预约相关
  DEFAULT_APPOINTMENT_DURATION: 30, // 分钟
  MAX_APPOINTMENT_DURATION: 120, // 分钟
  MIN_APPOINTMENT_DURATION: 15, // 分钟
  
  // 时间相关
  DEFAULT_EXPIRE_HOURS: DEFAULT_EXPIRE_HOURS, // 小时
  DEFAULT_BUFFER_MINUTES: DEFAULT_BUFFER_MINUTES, // 分钟
  
  // 配额相关
  DEFAULT_MONTHLY_QUOTA: 10,
  LEVEL1_AUTO_APPROVE: 2,
  LEVEL2_AUTO_APPROVE: 0,
  PREMIUM_AUTO_APPROVE: 999,
  
  // 分页
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // 缓存
  SLOTS_CACHE_TTL: 300, // 5分钟
  USER_CACHE_TTL: 3600, // 1小时
  
  // 限流
  RATE_LIMIT_WINDOW: 900, // 15分钟
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_REQUESTS_PER_WINDOW: 100
}

// 状态常量
export const APPOINTMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  EXPIRED: 'expired'
} as const

export const USER_ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin'
} as const

export const SERVICE_LEVELS = {
  LEVEL1: 'level1',
  LEVEL2: 'level2',
  PREMIUM: 'premium'
} as const

// 审计日志动作
export const AUDIT_ACTIONS = {
  // 用户相关
  USER_LOGIN: 'USER_LOGIN',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGOUT: 'USER_LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  
  // 预约相关
  APPOINTMENT_CREATED: 'APPOINTMENT_CREATED',
  APPOINTMENT_APPROVED: 'APPOINTMENT_APPROVED',
  APPOINTMENT_REJECTED: 'APPOINTMENT_REJECTED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_COMPLETED: 'APPOINTMENT_COMPLETED',
  APPOINTMENT_EXPIRED: 'APPOINTMENT_EXPIRED',
  
  // 候补队列
  WAITLIST_ADDED: 'WAITLIST_ADDED',
  WAITLIST_REMOVED: 'WAITLIST_REMOVED',
  WAITLIST_PROMOTED: 'WAITLIST_PROMOTED',
  
  // 系统相关
  POLICY_UPDATED: 'POLICY_UPDATED',
  SYSTEM_JOB_RUN: 'SYSTEM_JOB_RUN',
  QUOTA_RESET: 'QUOTA_RESET'
} as const

// 错误码
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // 业务错误
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  TEACHER_NOT_FOUND: 'TEACHER_NOT_FOUND',
  SUBJECT_MISMATCH: 'SUBJECT_MISMATCH',
  SLOT_TAKEN: 'SLOT_TAKEN',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  MAX_DAILY_REACHED: 'MAX_DAILY_REACHED',
  STATE_CONFLICT: 'STATE_CONFLICT',
  IDEMPOTENT_CONFLICT: 'IDEMPOTENT_CONFLICT'
} as const

// 时间格式
export const TIME_FORMATS = {
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DDTHH:mm:ss.sssZ',
  TIME: 'HH:mm',
  DISPLAY_DATE: 'YYYY年MM月DD日',
  DISPLAY_TIME: 'HH:mm',
  DISPLAY_DATETIME: 'YYYY年MM月DD日 HH:mm'
} as const

// 路由路径
export const ROUTES = {
  // 公共路由
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  
  // 学生路由
  STUDENT_DASHBOARD: '/dashboard',
  STUDENT_BOOK: '/dashboard/book-appointment',
  STUDENT_APPOINTMENTS: '/dashboard/my-appointments',
  STUDENT_WAITLIST: '/dashboard/waitlist',
  
  // 教师路由
  TEACHER_DASHBOARD: '/dashboard',
  TEACHER_AVAILABILITY: '/dashboard/availability',
  TEACHER_APPOINTMENTS: '/dashboard/appointments',
  
  // 管理员路由 (暂时禁用)
  // ADMIN_DASHBOARD: '/admin',
  // ADMIN_USERS: '/admin/users',
  // ADMIN_POLICIES: '/admin/policies',
  // ADMIN_AUDIT_LOGS: '/admin/audit-logs',
  
  // API路由
  API_AUTH: '/api/auth',
  API_APPOINTMENTS: '/api/appointments',
  API_SLOTS: '/api/slots',
  API_TEACHERS: '/api/teachers',
  API_ADMIN: '/api/admin'
} as const
