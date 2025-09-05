import { ApiErrorCode } from '@/lib/api/errors'

export type SupportedLocale = 'zh-CN' | 'en'

// 中文文案映射（优先覆盖常见&已使用的错误码）
const zhCN: Record<string, string> = {
  // Generic
  [ApiErrorCode.BAD_REQUEST]: '请求参数不正确，请检查后重试',
  [ApiErrorCode.VALIDATION_ERROR]: '数据校验失败，请检查输入内容',
  [ApiErrorCode.INVALID]: '请求无效',
  [ApiErrorCode.FORBIDDEN]: '没有权限执行该操作',
  [ApiErrorCode.UNAUTHORIZED]: '未认证，请先登录',
  [ApiErrorCode.NOT_FOUND]: '资源不存在或已删除',
  [ApiErrorCode.CONFLICT]: '当前数据状态不允许该操作',
  [ApiErrorCode.TOO_MANY_REQUESTS]: '操作过于频繁，请稍后再试',
  [ApiErrorCode.DB_UNAVAILABLE]: '服务暂时不可用，请稍后重试',
  [ApiErrorCode.INTERNAL_ERROR]: '服务器开小差了，请稍后再试',

  // Auth
  [ApiErrorCode.AUTH_INVALID_CREDENTIALS]: '账号或密码不正确',
  [ApiErrorCode.AUTH_MISSING_REFRESH_TOKEN]: '登录已过期，请重新登录',
  [ApiErrorCode.AUTH_INVALID_REFRESH_TOKEN]: '登录已过期，请重新登录',

  // Users
  [ApiErrorCode.USER_NOT_FOUND]: '用户不存在',
  [ApiErrorCode.STUDENT_NOT_FOUND]: '学生不存在',
  [ApiErrorCode.TEACHER_NOT_FOUND]: '教师不存在',
  [ApiErrorCode.STUDENT_INACTIVE_OR_NOT_FOUND]: '学生不存在或未激活',
  [ApiErrorCode.TEACHER_INACTIVE_OR_NOT_FOUND]: '教师不存在或未激活',
  EMAIL_EXISTS: '该邮箱已被注册',

  // Subjects / Policies
  [ApiErrorCode.SUBJECT_CONFLICT]: '科目名称或编码已存在',
  [ApiErrorCode.SUBJECT_INVALID_INPUT]: '科目信息不完整或格式不正确',
  [ApiErrorCode.POLICY_INVALID_LEVEL]: '策略等级无效',
  [ApiErrorCode.POLICY_INVALID_MONTHLY_AUTO_APPROVE]: '自动批准次数无效',
  [ApiErrorCode.POLICY_INVALID_EXPIRE_HOURS]: '过期小时数无效',

  // Appointments
  [ApiErrorCode.APPOINTMENT_STATE_CONFLICT]: '当前状态不支持该操作',
  [ApiErrorCode.APPOINTMENT_REJECT_REASON_REQUIRED]: '请填写拒绝原因',
  [ApiErrorCode.SLOT_TAKEN]: '该时间已被占用，请选择其他时间',
  [ApiErrorCode.MAX_DAILY_REACHED]: '该教师当日预约已满',
  [ApiErrorCode.QUOTA_EXCEEDED]: '已超出当月预约配额',
  [ApiErrorCode.SUBJECT_MISMATCH]: '科目不匹配，请选择正确的科目',

  // Availability & Blocked Times
  [ApiErrorCode.AVAILABILITY_INVALID_MODE]: '请设置每周重复（需要提供星期几）',
  [ApiErrorCode.AVAILABILITY_CONFLICT_APPOINTMENT]: '与已有预约冲突，请调整时间',
  [ApiErrorCode.AVAILABILITY_CONFLICT_GENERAL]: '时间段存在冲突，请调整时间',
  [ApiErrorCode.BLOCKEDTIME_CONFLICT_APPOINTMENT]: '阻塞时间与已有预约冲突',

  // Waitlist
  [ApiErrorCode.WAITLIST_DUPLICATE_ENTRY]: '已在候补队列中',
  [ApiErrorCode.WAITLIST_ENTRY_NOT_FOUND]: '候补记录不存在',
  [ApiErrorCode.WAITLIST_FORBIDDEN_REMOVE]: '只能移除自己的候补记录',
  [ApiErrorCode.WAITLIST_SLOT_UNAVAILABLE]: '该时间段已不可用',
  [ApiErrorCode.WAITLIST_EMPTY]: '当前时段无候补记录',
  [ApiErrorCode.WAITLIST_MISSING_FIELDS]: '参数缺失，请检查后重试',
  [ApiErrorCode.WAITLIST_PROMOTE_MISSING_FIELDS]: '参数缺失，请检查后重试',

  // Email/SMTP
  [ApiErrorCode.SMTP_CONNECTION_FAILED]: '邮件服务器连接失败，请检查配置',
  [ApiErrorCode.EMAIL_SEND_FAILED]: '邮件发送失败，请稍后重试',
  [ApiErrorCode.EMAIL_TEST_FAILED]: '测试邮件发送失败，请检查配置',

  // Jobs
  [ApiErrorCode.JOB_INVALID_OFFSET]: '提醒参数无效，仅支持 1 或 24 小时',

  // Fallback
  ERROR: '请求失败，请稍后重试',
}

// 英文简版（可按需补全）
const en: Record<string, string> = {
  [ApiErrorCode.BAD_REQUEST]: 'Invalid request. Please check your input.',
  [ApiErrorCode.VALIDATION_ERROR]: 'Validation failed. Please check your input.',
  [ApiErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ApiErrorCode.UNAUTHORIZED]: 'Please sign in to continue.',
  [ApiErrorCode.NOT_FOUND]: 'Resource not found.',
  [ApiErrorCode.CONFLICT]: 'Operation not allowed in current state.',
  [ApiErrorCode.DB_UNAVAILABLE]: 'Service unavailable. Please try again later.',
  [ApiErrorCode.INTERNAL_ERROR]: 'Something went wrong. Please try again later.',

  [ApiErrorCode.AUTH_INVALID_CREDENTIALS]: 'Incorrect email or password.',
  [ApiErrorCode.AUTH_INVALID_REFRESH_TOKEN]: 'Session expired. Please sign in again.',

  [ApiErrorCode.SLOT_TAKEN]: 'Time slot is already taken. Please choose another one.',
  [ApiErrorCode.SUBJECT_MISMATCH]: 'Subject mismatch. Please choose a correct subject.',

  ERROR: 'Request failed. Please try again later.',
}

const bundles: Record<SupportedLocale, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
}

export function errorCodeToMessage(code?: string, locale: SupportedLocale = 'zh-CN'): string | undefined {
  if (!code) return undefined
  const dict = bundles[locale] || zhCN
  return dict[code] || dict.ERROR
}

export function getFriendlyErrorMessage(
  payload?: { code?: string; error?: string; message?: string },
  opts?: { locale?: SupportedLocale; fallback?: string }
): string {
  const locale = opts?.locale ?? 'zh-CN'
  const dict = bundles[locale] || zhCN
  const code = payload?.code || payload?.error
  if (code && dict[code]) return dict[code]
  return payload?.message || opts?.fallback || dict.ERROR
}

// 某些错误可自动重试（用于前端策略）
export function isRetryableError(code?: string): boolean {
  if (!code) return false
  return [
    ApiErrorCode.DB_UNAVAILABLE,
    ApiErrorCode.INTERNAL_ERROR,
    ApiErrorCode.EMAIL_SEND_FAILED,
    ApiErrorCode.SMTP_CONNECTION_FAILED,
  ].includes(code as ApiErrorCode)
}

// 某些错误建议触发登出/跳转登录
export function shouldForceRelogin(code?: string): boolean {
  if (!code) return false
  return [ApiErrorCode.UNAUTHORIZED, ApiErrorCode.AUTH_MISSING_REFRESH_TOKEN, ApiErrorCode.AUTH_INVALID_REFRESH_TOKEN].includes(
    code as ApiErrorCode
  )
}

