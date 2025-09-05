import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['student', 'teacher', 'admin']),
  password: z.string().min(8)
})

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  updates: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    status: z.string().optional(),
    student: z.object({
      serviceLevel: z.string().optional(),
      monthlyMeetingsUsed: z.number().optional()
    }).optional(),
    teacher: z.object({
      maxDailyMeetings: z.number().optional(),
      bufferMinutes: z.number().optional()
    }).optional()
  })
})

export const createTeacherSchema = z.object({
  userId: z.string().uuid(),
  subjects: z.array(z.string().uuid()).min(1),
  maxDailyMeetings: z.number().optional(),
  bufferMinutes: z.number().optional()
})

export const waitlistAddSchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().min(1),
  slot: z.string(),
  studentId: z.string().uuid(),
  subject: z.string().min(1)
})

export const waitlistRemoveSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid()
})

export const testEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().optional(),
  message: z.string().optional()
})
