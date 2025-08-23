// 用户相关类型
export interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  student?: Student
  teacher?: Teacher
}

export type UserRole = 'student' | 'teacher' | 'admin'

export interface Student {
  id: string
  userId: string
  serviceLevel: 'level1' | 'level2' | 'premium'
  monthlyMeetingsUsed: number
  lastQuotaReset: Date
  enrolledSubjects: string[]
  gradeLevel?: number
  user: User
}

export interface Teacher {
  id: string
  userId: string
  subjects: string[]
  maxDailyMeetings: number
  bufferMinutes: number
  workingHours?: any
  user: User
}

// 预约相关类型
export interface Appointment {
  id: string
  studentId: string
  teacherId: string
  subjectId: string
  scheduledTime: Date
  durationMinutes: number
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'no_show' | 'expired' | 'rejected'
  approvalRequired: boolean
  approvedAt?: Date
  studentNotes?: string
  teacherNotes?: string
  createdAt: Date
  updatedAt: Date
  student: Student
  teacher: Teacher
  subject: Subject
}

// 科目类型
export interface Subject {
  id: string
  name: string
  code: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

// 教师可用性类型
export interface TeacherAvailability {
  id: string
  teacherId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isRecurring: boolean
  createdAt: Date
  updatedAt: Date
}

// 可用性相关类型
export interface Availability {
  id: string
  teacherId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isRecurring: boolean
}

export interface TeacherInfo {
  id: string
  name: string
  email: string
  subjects: string[]
  maxDailyMeetings: number
  bufferMinutes: number
}

// 阻塞时间类型
export interface BlockedTime {
  id: string
  teacherId: string
  startTime: Date
  endTime: Date
  reason?: string
  createdAt: Date
  updatedAt: Date
}

// 候补队列类型
export interface Waitlist {
  id: string
  teacherId: string
  date: string
  slot: Date
  studentId: string
  createdAt: Date
  student: Student
  teacher: Teacher
}

// 服务策略类型
export interface ServicePolicy {
  id: string
  level: 'level1' | 'level2' | 'premium'
  monthlyAutoApprove: number
  priority: boolean
  expireHours: number
  reminderOffsets: string
  createdAt: Date
  updatedAt: Date
}

// 审计日志类型
export interface AuditLog {
  id: string
  actorId: string
  action: string
  targetId?: string
  details?: string
  ipAddress?: string
  userAgent?: string
  createdAt: Date
  actor: User
}

// 管理员相关类型
export interface AdminDashboardData {
  stats: {
    totalUsers: number
    totalStudents: number
    totalTeachers: number
    totalAppointments: number
    pendingApprovals: number
    expiredAppointments: number
  }
  systemHealth: {
    database: 'healthy' | 'warning' | 'error'
    cache: 'healthy' | 'warning' | 'error'
    queue: 'healthy' | 'warning' | 'error'
  }
}

export interface UserManagementData {
  users: User[]
  total: number
  filters: {
    role?: string
    status?: string
    search?: string
  }
}

export interface PolicyManagementData {
  policies: ServicePolicy[]
}

export interface AuditLogData {
  logs: Array<{
    id: string
    actor: string
    action: string
    target: string
    details: string
    ipAddress: string
    userAgent: string
    timestamp: string
  }>
  total: number
  filters: {
    actor?: string
    action?: string
    from?: string
    to?: string
  }
}

// 日历相关类型
export interface CalendarSlot {
  id: string
  startTime: string
  endTime: string
  status: 'available' | 'booked' | 'pending' | 'blocked'
  studentName?: string
  subject?: string
  appointmentId?: string
}

// 表单相关类型
export interface LoginFormData {
  email: string
  password: string
}

export interface RegisterFormData {
  email: string
  password: string
  name: string
  role: 'student' | 'teacher'
  serviceLevel?: 'level1' | 'level2' | 'premium'
  enrolledSubjects?: string[]
}

export interface CreateAppointmentData {
  studentId: string
  teacherId: string
  subjectId: string
  scheduledTime: string
  durationMinutes: number
  idempotencyKey: string
}

export interface UpdateAppointmentData {
  action: 'approve' | 'reject' | 'cancel' | 'complete' | 'no_show'
  reason?: string
}

// 表单验证类型
export interface ValidationErrors {
  [key: string]: string
}

// API响应类型
export interface ApiResponse<T = any> {
  ok?: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  nextCursor?: string
}
