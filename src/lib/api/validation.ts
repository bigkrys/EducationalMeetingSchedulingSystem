import { z } from 'zod'

// 用户相关验证
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  serviceLevel: z.enum(['level1', 'level2', 'premium']),
  enrolledSubjects: z.array(z.string()).min(1)
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

export const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8)
})

// 预约相关验证
export const createAppointmentSchema = z.object({
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  subject: z.string(),
  scheduledTime: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(120).default(30),
  idempotencyKey: z.string()
})

export const updateAppointmentSchema = z.object({
  action: z.enum(['approve', 'reject', 'cancel', 'complete', 'no_show']),
  reason: z.string().optional()
})

// 教师可用性验证
export const teacherAvailabilitySchema = z.object({
  // 支持两种模式：具体日期 或 周循环
  specificDate: z.string().datetime().optional(), // ISO 日期字符串
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 星期几（0-6）
  
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  isActive: z.boolean().default(true)
}).refine(
  (data) => {
    // 确保要么是具体日期，要么是周循环
    return (data.specificDate && !data.dayOfWeek) || (!data.specificDate && data.dayOfWeek !== undefined)
  },
  {
    message: "必须选择具体日期或设置周循环",
    path: ["specificDate"]
  }
)

// 阻塞时间验证
export const blockedTimeSchema = z.object({
  teacherId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().optional()
})

// 查询参数验证
export const slotsQuerySchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.number().int().min(15).max(120).default(30)
})

export const appointmentsQuerySchema = z.object({
  role: z.enum(['student', 'teacher']),
  studentId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'completed', 'cancelled', 'no_show', 'expired']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20)
})

// 候补队列验证
export const waitlistSchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().datetime(),
  studentId: z.string().uuid()
})

// 服务策略验证
export const servicePolicySchema = z.object({
  level1: z.object({
    monthlyAutoApprove: z.number().int().min(0)
  }),
  level2: z.object({
    monthlyAutoApprove: z.number().int().min(0)
  }),
  premium: z.object({
    priority: z.boolean()
  }),
  expireHours: z.number().int().min(1),
  remindOffsets: z.array(z.number().int().min(0))
})

// 前端验证函数
export const validateEmail = (email: string): { isValid: boolean; message: string } => {
  if (!email) {
    return { isValid: false, message: '邮箱不能为空' }
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { isValid: false, message: '请输入有效的邮箱地址' }
  }
  
  return { isValid: true, message: '' }
}

export const validatePassword = (password: string): { isValid: boolean; message: string } => {
  if (!password) {
    return { isValid: false, message: '密码不能为空' }
  }
  
  if (password.length < 8) {
    return { isValid: false, message: '密码至少需要8个字符' }
  }
  
  if (password.length > 50) {
    return { isValid: false, message: '密码不能超过50个字符' }
  }
  
  // 检查密码强度
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  
  if (!hasLetter || !hasNumber) {
    return { isValid: false, message: '密码必须包含字母和数字' }
  }
  
  return { isValid: true, message: '' }
}

export const validateName = (name: string): { isValid: boolean; message: string } => {
  if (!name) {
    return { isValid: false, message: '姓名不能为空' }
  }
  
  if (name.length < 2) {
    return { isValid: false, message: '姓名至少需要2个字符' }
  }
  
  if (name.length > 20) {
    return { isValid: false, message: '姓名不能超过20个字符' }
  }
  
  // 检查是否包含特殊字符
  const nameRegex = /^[\u4e00-\u9fa5a-zA-Z\s]+$/
  if (!nameRegex.test(name)) {
    return { isValid: false, message: '姓名只能包含中文、英文和空格' }
  }
  
  return { isValid: true, message: '' }
}

export const validateSubjectSelection = (subjectIds: string[], minCount: number = 1): { isValid: boolean; message: string } => {
  if (subjectIds.length < minCount) {
    return { isValid: false, message: `请至少选择${minCount}个科目` }
  }
  
  if (subjectIds.length > 10) {
    return { isValid: false, message: '最多只能选择10个科目' }
  }
  
  return { isValid: true, message: '' }
}

export const validateMaxDailyMeetings = (value: number): { isValid: boolean; message: string } => {
  if (value < 1) {
    return { isValid: false, message: '每日最大预约数不能少于1' }
  }
  
  if (value > 12) {
    return { isValid: false, message: '每日最大预约数不能超过12' }
  }
  
  return { isValid: true, message: '' }
}

export const validateBufferMinutes = (value: number): { isValid: boolean; message: string } => {
  if (value < 0) {
    return { isValid: false, message: '缓冲时间不能为负数' }
  }
  
  if (value > 60) {
    return { isValid: false, message: '缓冲时间不能超过60分钟' }
  }
  
  return { isValid: true, message: '' }
}

// 表单整体验证
export const validateRegistrationForm = (data: {
  email: string
  password: string
  name: string
  role: 'student' | 'teacher'
  subjectIds: string[]
  serviceLevel?: string
  maxDailyMeetings?: number
  bufferMinutes?: number
}): { isValid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  
  // 验证邮箱
  const emailValidation = validateEmail(data.email)
  if (!emailValidation.isValid) {
    errors.email = emailValidation.message
  }
  
  // 验证密码
  const passwordValidation = validatePassword(data.password)
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.message
  }
  
  // 验证姓名
  const nameValidation = validateName(data.name)
  if (!nameValidation.isValid) {
    errors.name = nameValidation.message
  }
  
  // 验证科目选择
  const subjectValidation = validateSubjectSelection(data.subjectIds)
  if (!subjectValidation.isValid) {
    errors.subjects = subjectValidation.message
  }
  
  // 验证教师特有字段
  if (data.role === 'teacher') {
    if (data.maxDailyMeetings !== undefined) {
      const maxDailyValidation = validateMaxDailyMeetings(data.maxDailyMeetings)
      if (!maxDailyValidation.isValid) {
        errors.maxDailyMeetings = maxDailyValidation.message
      }
    }
    
    if (data.bufferMinutes !== undefined) {
      const bufferValidation = validateBufferMinutes(data.bufferMinutes)
      if (!bufferValidation.isValid) {
        errors.bufferMinutes = bufferValidation.message
      }
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

// 类型导出
export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
export type TeacherAvailabilityInput = z.infer<typeof teacherAvailabilitySchema>
export type BlockedTimeInput = z.infer<typeof blockedTimeSchema>
export type SlotsQueryInput = z.infer<typeof slotsQuerySchema>
export type AppointmentsQueryInput = z.infer<typeof appointmentsQuerySchema>
export type WaitlistInput = z.infer<typeof waitlistSchema>
export type ServicePolicyInput = z.infer<typeof servicePolicySchema>
