import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/api/db'
import { teacherAvailabilitySchema } from '@/lib/api/validation'
import { withRole, AuthenticatedRequest } from '@/lib/api/middleware'
import { z } from 'zod'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { env } from '@/lib/env'
import { ApiErrorCode as E } from '@/lib/api/errors'

// 类型定义
interface TeacherAvailability {
  id: string
  teacherId: string
  specificDate?: Date
  dayOfWeek?: number
  startTime: string
  endTime: string
}

interface BlockedTime {
  id: string
  teacherId: string
  startTime: Date
  endTime: Date
  reason: string | null
}

interface Appointment {
  id: string
  teacherId: string
  scheduledTime: Date
  durationMinutes: number
  status: string
}

interface TimeConflict {
  type: 'exact_match' | 'overlap' | 'contained' | 'contains' | 'blocked_time' | 'appointment' | 'invalid_time'
  existingSlot?: TeacherAvailability
  overlap?: string
  blockedTime?: BlockedTime
  appointment?: Appointment
  message: string
}

interface TimeValidation {
  isValid: boolean
  message: string
}

interface TimeOverlapAnalysis {
  type: 'no_overlap' | 'exact_match' | 'overlap' | 'contained' | 'contains'
  overlap?: string
  overlapMinutes?: number
}

interface ConflictResult {
  conflicts: TimeConflict[]
  overlappingSlots: TeacherAvailability[]
}

interface AvailabilityRequest {
  specificDate?: string
  dayOfWeek?: number
  startTime: string
  endTime: string
  isActive?: boolean
}

// 辅助函数：检测可用性冲突
async function detectAvailabilityConflicts(
  teacherId: string,
  request: AvailabilityRequest
): Promise<ConflictResult> {
  const conflicts: TimeConflict[] = []
  const overlappingSlots: TeacherAvailability[] = []
  const DEBUG_AV = env.NODE_ENV === 'development' || (env.DEBUG_AVAILABILITY_LOGS || 'false').toLowerCase() === 'true'
  if (DEBUG_AV) logger.debug(`availability.detect start`, { teacherId, request })

  // 验证时间格式和逻辑
  const timeValidation = validateTimeLogic(request.startTime, request.endTime)
  if (!timeValidation.isValid) {
    if (DEBUG_AV) logger.debug('availability.detect invalid_time', { message: timeValidation.message })
    conflicts.push({
      type: 'invalid_time',
      message: timeValidation.message
    })
    return { conflicts, overlappingSlots }
  }

  let existingSlots: TeacherAvailability[] = []

  if (request.specificDate) {
    // 检查具体日期的冲突
    const targetDate = new Date(request.specificDate)
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    const found = await prisma.teacherAvailability.findMany({
      where: {
        teacherId,
        dayOfWeek: targetDate.getDay(),
        isActive: true
      },
      orderBy: { startTime: 'asc' }
    })
    existingSlots = found.map((s: any) => ({
      id: s.id,
      teacherId: s.teacherId,
      dayOfWeek: s.dayOfWeek,
      startTime: String(s.startTime),
      endTime: String(s.endTime)
    }))
  } else if (request.dayOfWeek !== undefined) {
    // 检查周循环的冲突
    const found = await prisma.teacherAvailability.findMany({
      where: {
        teacherId,
        dayOfWeek: request.dayOfWeek,
        isActive: true
      },
      orderBy: { startTime: 'asc' }
    })
    existingSlots = found.map((s: any) => ({
      id: s.id,
      teacherId: s.teacherId,
      dayOfWeek: s.dayOfWeek,
      startTime: String(s.startTime),
      endTime: String(s.endTime)
    }))
  }

  if (DEBUG_AV) {
    logger.debug('availability.detect found_slots', { count: existingSlots.length })
    existingSlots.forEach((slot, index) => {
      logger.debug('availability.detect slot', { index: index + 1, start: slot.startTime, end: slot.endTime })
    })
  }

  // 检查与现有时间段的冲突
  for (const slot of existingSlots) {
    if (DEBUG_AV) logger.debug('availability.detect check_slot', { start: slot.startTime, end: slot.endTime })
    const overlapType = analyzeTimeOverlap(slot.startTime, slot.endTime, request.startTime, request.endTime)
    if (DEBUG_AV) logger.debug('availability.detect overlap_type', { type: overlapType.type })
    
    if (overlapType.type !== 'no_overlap') {
      if (overlapType.type === 'exact_match') {
        if (DEBUG_AV) logger.debug('availability.detect conflict exact_match')
        conflicts.push({
          type: 'exact_match',
          existingSlot: slot,
          message: `这个时间段已经存在了！您设置的时间 ${slot.startTime}-${slot.endTime} 与现有时间段完全重复。`
        })
      } else if (overlapType.type === 'overlap') {
        if (DEBUG_AV) logger.debug('availability.detect conflict overlap')
        overlappingSlots.push(slot)
        conflicts.push({
          type: 'overlap',
          existingSlot: slot,
          overlap: overlapType.overlap,
          message: `时间冲突！您设置的时间段与现有时间段 ${slot.startTime}-${slot.endTime} 有重叠。重叠时间：${overlapType.overlap}`
        })
      } else if (overlapType.type === 'contained') {
        if (DEBUG_AV) logger.debug('availability.detect conflict contained')
        conflicts.push({
          type: 'contained',
          existingSlot: slot,
          message: `您设置的时间段完全包含在现有时间段 ${slot.startTime}-${slot.endTime} 内。`
        })
      } else if (overlapType.type === 'contains') {
        if (DEBUG_AV) logger.debug('availability.detect conflict contains')
        conflicts.push({
          type: 'contains',
          existingSlot: slot,
          message: `您设置的时间段完全包含了现有时间段 ${slot.startTime}-${slot.endTime}。`
        })
      }
    } else {
      if (DEBUG_AV) logger.debug('availability.detect no_conflict')
    }
  }

  if (DEBUG_AV) logger.debug('availability.detect done', { conflicts: conflicts.length })
  return { conflicts, overlappingSlots }
}

// 辅助函数：验证时间逻辑
function validateTimeLogic(startTime: string, endTime: string): TimeValidation {
  // 检查时间格式
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return {
      isValid: false,
      message: '时间格式不正确，请使用 HH:MM 格式（如 09:00）'
    }
  }

  // 检查时间逻辑
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  
  if (start >= end) {
    return {
      isValid: false,
      message: '开始时间必须早于结束时间'
    }
  }

  if (end - start < 15) {
    return {
      isValid: false,
      message: '时间段不能少于15分钟'
    }
  }

  if (end - start > 480) { // 8小时
    return {
      isValid: false,
      message: '单个时间段不能超过8小时'
    }
  }

  return {
    isValid: true,
    message: '时间设置有效'
  }
}

// 辅助函数：分析时间重叠类型
function analyzeTimeOverlap(start1: string, end1: string, start2: string, end2: string): TimeOverlapAnalysis {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  const DEBUG_AV = env.NODE_ENV === 'development' || (env.DEBUG_AVAILABILITY_LOGS || 'false').toLowerCase() === 'true'
  if (DEBUG_AV) logger.debug('availability.overlap.analyze', { start1, end1, start2, end2, s1, e1, s2, e2 })
  
  // 没有重叠的情况：
  // 1. 第一个时间段完全在第二个时间段之前 (e1 <= s2)
  // 2. 第二个时间段完全在第一个时间段之前 (e2 <= s1)
  if (e1 <= s2 || e2 <= s1) {
    if (DEBUG_AV) logger.debug('availability.overlap.no_overlap')
    return { type: 'no_overlap' }
  }
  
  // 完全匹配
  if (s1 === s2 && e1 === e2) {
    if (DEBUG_AV) logger.debug('availability.overlap.exact_match')
    return { type: 'exact_match' }
  }
  
  // 包含关系：第一个时间段包含第二个时间段
  if (s1 <= s2 && e1 >= e2) {
    if (DEBUG_AV) logger.debug('availability.overlap.contains')
    return { type: 'contains' }
  }
  
  // 包含关系：第二个时间段包含第一个时间段
  if (s2 <= s1 && e2 >= e1) {
    if (DEBUG_AV) logger.debug('availability.overlap.contained')
    return { type: 'contained' }
  }
  
  // 部分重叠：两个时间段有交集但不完全包含
  const overlapStart = Math.max(s1, s2)
  const overlapEnd = Math.min(e1, e2)
  const overlapMinutes = overlapEnd - overlapStart
  if (DEBUG_AV) logger.debug('availability.overlap.partial', { overlapStart, overlapEnd, overlapMinutes })
  
  return {
    type: 'overlap',
    overlap: `${minutesToTime(overlapStart)}-${minutesToTime(overlapEnd)}`,
    overlapMinutes
  }
}

// 辅助函数：检查时间重叠（保留向后兼容）
function hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const analysis = analyzeTimeOverlap(start1, end1, start2, end2)
  return analysis.type !== 'no_overlap'
}

// 辅助函数：计算重叠时间
function calculateOverlap(start1: string, end1: string, start2: string, end2: string): string {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  
  const overlapStart = Math.max(s1, s2)
  const overlapEnd = Math.min(e1, e2)
  
  if (overlapStart >= overlapEnd) return ''
  
  return `${minutesToTime(overlapStart)}-${minutesToTime(overlapEnd)}`
}

// 辅助函数：时间转换为分钟数
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// 辅助函数：分钟数转换为时间
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

// 辅助函数：生成友好的冲突消息
function generateFriendlyConflictMessage(conflicts: TimeConflict[]): string {
  if (conflicts.length === 1) {
    const conflict = conflicts[0]
    switch (conflict.type) {
      case 'exact_match':
        return `这个时间段已经存在了！您设置的时间 ${conflict.existingSlot?.startTime}-${conflict.existingSlot?.endTime} 与现有时间段完全重复。`
      case 'overlap':
        return `时间冲突！您设置的时间段与现有时间段 ${conflict.existingSlot?.startTime}-${conflict.existingSlot?.endTime} 有重叠。`
      case 'blocked_time':
        return `时间冲突！您设置的时间段与阻塞时间 ${conflict.blockedTime?.startTime.toTimeString().slice(0, 5)}-${conflict.blockedTime?.endTime.toTimeString().slice(0, 5)} 冲突。`
      case 'appointment':
        return `时间冲突！您设置的时间段与已有预约时间冲突。`
      default:
        return '发现时间冲突，请检查您的时间设置。'
    }
  } else {
    const conflictTypes = conflicts.map(c => c.type)
    if (conflictTypes.includes('exact_match')) {
      return `发现多个时间冲突！包括重复时间段和重叠时间段。`
    } else if (conflictTypes.includes('overlap')) {
      return `发现多个时间重叠！您设置的时间段与多个现有时间段冲突。`
    } else {
      return `发现多个时间冲突！请检查您的时间设置。`
    }
  }
}

// 辅助函数：生成冲突解决建议
function generateConflictSuggestions(conflicts: TimeConflict[], request: AvailabilityRequest) {
  const suggestions: Array<{
    action: string
    description: string
    result?: string
    slots?: string[]
    recommendation?: string
    priority?: number
  }> = []
  
  for (const conflict of conflicts) {
    if (conflict.type === 'overlap' && conflict.existingSlot) {
      const existing = conflict.existingSlot
      
      // 计算合并后的时间段
      const mergedStart = minutesToTime(Math.min(timeToMinutes(existing.startTime), timeToMinutes(request.startTime)))
      const mergedEnd = minutesToTime(Math.max(timeToMinutes(existing.endTime), timeToMinutes(request.endTime)))
      
      suggestions.push({
        action: 'merge',
        description: `合并时间段：将您的时间与现有时间 ${existing.startTime}-${existing.endTime} 合并`,
        result: `${mergedStart}-${mergedEnd}`,
        recommendation: '推荐：这样可以最大化您的可用时间，避免时间碎片化'
      })
      
      // 计算分割后的时间段
      const splitSlots = []
      if (timeToMinutes(request.startTime) < timeToMinutes(existing.startTime)) {
        splitSlots.push(`${request.startTime}-${existing.startTime}`)
      }
      if (timeToMinutes(request.endTime) > timeToMinutes(existing.endTime)) {
        splitSlots.push(`${existing.endTime}-${request.endTime}`)
      }
      
      if (splitSlots.length > 0) {
        suggestions.push({
          action: 'split',
          description: `分割时间段：保留不重叠的部分`,
          slots: splitSlots,
          recommendation: '这样可以保留您想要的时间段，同时避免冲突'
        })
      }
    } else if (conflict.type === 'exact_match') {
      suggestions.push({
        action: 'update',
        description: `更新现有时间段：修改重复时间段的设置`,
        recommendation: '您可以更新现有时间段的重复设置或其他属性',
        priority: 3
      })
    } else if (conflict.type === 'contained' && conflict.existingSlot) {
      const existing = conflict.existingSlot
      suggestions.push({
        action: 'extend',
        description: `扩展时间段：将现有时间 ${existing.startTime}-${existing.endTime} 扩展到包含您的时间`,
        recommendation: '这样可以避免时间碎片化，提供更连续的可用时间',
        priority: 2
      })
    } else if (conflict.type === 'contains' && conflict.existingSlot) {
      const existing = conflict.existingSlot
      suggestions.push({
        action: 'split_around',
        description: `分割时间段：在现有时间 ${existing.startTime}-${existing.endTime} 前后创建可用时间`,
        slots: [
          `${request.startTime}-${existing.startTime}`,
          `${existing.endTime}-${request.endTime}`
        ].filter(slot => {
          const [start, end] = slot.split('-')
          return timeToMinutes(end) > timeToMinutes(start)
        }),
        recommendation: '这样可以保留现有时间段，同时利用剩余时间',
        priority: 2
      })
    } else if (conflict.type === 'blocked_time') {
        suggestions.push({
          action: 'adjust',
          description: `调整时间：避开阻塞时间段`,
          recommendation: '建议您选择一个不与阻塞时间冲突的时间段',
          priority: 4
        })
      } else if (conflict.type === 'appointment') {
        suggestions.push({
          action: 'reschedule',
          description: `重新安排：选择没有预约冲突的时间`,
          recommendation: '建议您选择一个没有预约冲突的时间段',
          priority: 4
        })
      } else if (conflict.type === 'invalid_time') {
        suggestions.push({
          action: 'fix_time',
          description: `修正时间设置：检查时间格式和逻辑`,
          recommendation: '请确保开始时间早于结束时间，时间段在15分钟到8小时之间',
          priority: 5
        })
      }
    }
    
    // 按优先级排序建议
    return suggestions.sort((a, b) => (a.priority || 999) - (b.priority || 999))
  }

// 辅助函数：检查阻塞时间冲突
async function checkBlockedTimeConflicts(
  teacherId: string,
  request: AvailabilityRequest
): Promise<TimeConflict[]> {
  // 获取该教师的所有阻塞时间
  const blockedTimes = await prisma.blockedTime.findMany({
    where: { teacherId }
  })

  const conflicts: TimeConflict[] = []
  
  for (const blocked of blockedTimes) {
    let shouldCheck = false
    
    if (request.specificDate) {
      // 检查具体日期是否与阻塞时间冲突
      const targetDate = new Date(request.specificDate)
      const blockedDate = blocked.startTime
      shouldCheck = targetDate.toDateString() === blockedDate.toDateString()
    } else if (request.dayOfWeek !== undefined) {
      // 检查周循环是否与阻塞时间冲突
      const blockedDay = blocked.startTime.getDay()
      shouldCheck = blockedDay === request.dayOfWeek
    }
    
    if (shouldCheck) {
      const blockedStart = blocked.startTime.toTimeString().slice(0, 5)
      const blockedEnd = blocked.endTime.toTimeString().slice(0, 5)
      
      const overlapAnalysis = analyzeTimeOverlap(blockedStart, blockedEnd, request.startTime, request.endTime)
      
      if (overlapAnalysis.type !== 'no_overlap') {
        let message = ''
        if (overlapAnalysis.type === 'exact_match') {
          message = `您设置的时间段与阻塞时间完全冲突：${blockedStart}-${blockedEnd}`
        } else if (overlapAnalysis.type === 'contains') {
          message = `您设置的时间段包含了阻塞时间：${blockedStart}-${blockedEnd}`
        } else if (overlapAnalysis.type === 'contained') {
          message = `您设置的时间段被阻塞时间完全覆盖：${blockedStart}-${blockedEnd}`
        } else {
          message = `您设置的时间段与阻塞时间 ${blockedStart}-${blockedEnd} 有重叠。重叠时间：${overlapAnalysis.overlap}`
        }
        
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
          message
        })
      }
    }
  }
  
  return conflicts
}

// 辅助函数：检查预约冲突
async function checkAppointmentConflicts(
  teacherId: string,
  request: AvailabilityRequest
): Promise<TimeConflict[]> {
  // 获取该教师的所有预约
  const appointments = await prisma.appointment.findMany({
    where: {
      teacherId,
      status: { in: ['pending', 'approved'] }
    }
  })

  const conflicts: TimeConflict[] = []
  
  for (const appointment of appointments) {
    let shouldCheck = false
    
    if (request.specificDate) {
      // 检查具体日期是否与预约冲突
      const targetDate = new Date(request.specificDate)
      const appointmentDate = appointment.scheduledTime
      shouldCheck = targetDate.toDateString() === appointmentDate.toDateString()
    } else if (request.dayOfWeek !== undefined) {
      // 检查周循环是否与预约冲突
      const appointmentDay = appointment.scheduledTime.getDay()
      shouldCheck = appointmentDay === request.dayOfWeek
    }
    
    if (shouldCheck) {
      const appointmentStart = appointment.scheduledTime.toTimeString().slice(0, 5)
      const appointmentEnd = new Date(
        appointment.scheduledTime.getTime() + appointment.durationMinutes * 60000
      ).toTimeString().slice(0, 5)
      
      const overlapAnalysis = analyzeTimeOverlap(appointmentStart, appointmentEnd, request.startTime, request.endTime)
      
      if (overlapAnalysis.type !== 'no_overlap') {
        let message = ''
        if (overlapAnalysis.type === 'exact_match') {
          message = `您设置的时间段与预约时间完全冲突：${appointmentStart}（${appointment.durationMinutes}分钟）`
        } else if (overlapAnalysis.type === 'contains') {
          message = `您设置的时间段包含了预约时间：${appointmentStart}（${appointment.durationMinutes}分钟）`
        } else if (overlapAnalysis.type === 'contained') {
          message = `您设置的时间段被预约时间完全覆盖：${appointmentStart}（${appointment.durationMinutes}分钟）`
        } else {
          message = `您设置的时间段与预约时间 ${appointmentStart}（${appointment.durationMinutes}分钟）有重叠。重叠时间：${overlapAnalysis.overlap}`
        }
        
        conflicts.push({
          type: 'appointment',
          appointment,
          message
        })
      }
    }
  }
  
  return conflicts
}

// 辅助函数：合并重叠时间段
async function mergeOverlappingSlots(
  teacherId: string,
  newSlot: AvailabilityRequest,
  overlappingSlots: TeacherAvailability[]
) {
  // 找到最早开始时间和最晚结束时间
  let earliestStart = timeToMinutes(newSlot.startTime)
  let latestEnd = timeToMinutes(newSlot.endTime)
  
  for (const slot of overlappingSlots) {
    earliestStart = Math.min(earliestStart, timeToMinutes(slot.startTime))
    latestEnd = Math.max(latestEnd, timeToMinutes(slot.endTime))
  }
  
  // 删除所有重叠的时间段
  const slotIds = overlappingSlots.map(s => s.id)
  await prisma.teacherAvailability.deleteMany({
    where: { id: { in: slotIds } }
  })
  
  // 创建新的合并时间段
  if (newSlot.dayOfWeek === undefined) {
    throw new Error('dayOfWeek is required for merging slots')
  }
  
  const mergedSlot = await prisma.teacherAvailability.create({
    data: {
      teacherId,
      dayOfWeek: newSlot.dayOfWeek,
      startTime: minutesToTime(earliestStart),
      endTime: minutesToTime(latestEnd),
      isActive: true
    }
  })
  
  return mergedSlot
}

// 辅助函数：智能时间段优化建议
function generateTimeOptimizationSuggestions(
  teacherId: string,
  existingSlots: TeacherAvailability[]
): Array<{
  type: string
  description: string
  benefit: string
  action: string
}> {
  const suggestions: Array<{
    type: string
    description: string
    benefit: string
    action: string
  }> = []
  
  // 只处理周循环的时间段
  const weeklySlots = existingSlots.filter((slot: TeacherAvailability) => slot.dayOfWeek !== undefined)
  
  if (weeklySlots.length === 0) {
    return suggestions
  }
  
  // 按星期几分组
  const slotsByDay = new Map<number, TeacherAvailability[]>()
  weeklySlots.forEach((slot: TeacherAvailability) => {
    if (slot.dayOfWeek !== undefined) {
      if (!slotsByDay.has(slot.dayOfWeek)) {
        slotsByDay.set(slot.dayOfWeek, [])
      }
      slotsByDay.get(slot.dayOfWeek)!.push(slot)
    }
  })
  
  // 对每一天的时间段进行优化分析
  slotsByDay.forEach((slots: TeacherAvailability[], dayOfWeek: number) => {
    const sortedSlots = slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    
    // 检查是否有时间碎片
    for (let i = 0; i < sortedSlots.length - 1; i++) {
      const current = sortedSlots[i]
      const next = sortedSlots[i + 1]
      
      const gap = timeToMinutes(next.startTime) - timeToMinutes(current.endTime)
      
      if (gap >= 15 && gap <= 60) { // 15分钟到1小时的间隙
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        suggestions.push({
          type: 'time_gap',
          description: `${dayNames[dayOfWeek]}发现时间间隙：${current.endTime} 到 ${next.startTime}（${gap}分钟）`,
          benefit: '可以扩展相邻时间段或创建新的可用时间段',
          action: '建议将间隙时间分配给相邻时间段或创建新的可用时间段'
        })
      }
    }
    
    // 检查是否有过短的时间段
    const shortSlots = slots.filter((slot: TeacherAvailability) => {
      const duration = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)
      return duration < 30
    })
    
    if (shortSlots.length > 0) {
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      suggestions.push({
        type: 'short_slots',
        description: `${dayNames[dayOfWeek]}发现过短时间段：${shortSlots.map((s: TeacherAvailability) => `${s.startTime}-${s.endTime}`).join(', ')}`,
        benefit: '过短的时间段可能不适合预约，建议合并或扩展',
        action: '建议将短时间段与相邻时间段合并，或扩展到至少30分钟'
      })
    }
    
    // 检查是否有过长的时间段
    const longSlots = slots.filter((slot: TeacherAvailability) => {
      const duration = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)
      return duration > 240 // 4小时
    })
    
    if (longSlots.length > 0) {
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      suggestions.push({
        type: 'long_slots',
        description: `${dayNames[dayOfWeek]}发现过长时间段：${longSlots.map((s: TeacherAvailability) => `${s.startTime}-${s.endTime}`).join(', ')}`,
        benefit: '过长的时间段可以分割为多个适合预约的时间段',
        action: '建议将长时间段分割为2-3小时的多个时间段，提高预约灵活性'
      })
    }
  })
  
  return suggestions
}

// 获取教师可用性
async function getAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    // 从 URL 中提取 teacherId
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2] // /api/teachers/[id]/availability
    
    const user = request.user!

    // 检查权限 - 教师只能操作自己的资源
    if (user.role === 'teacher') {
      // 查找当前用户对应的教师记录
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher) {
        return fail('Teacher record not found', 403, E.FORBIDDEN)
      }
      
      // 确保教师只能操作自己的资源
      if (currentTeacher.id !== teacherId) {
        return fail('Teachers can only access their own availability', 403, E.FORBIDDEN)
      }
      
      // 权限验证通过，继续执行
    }

    const rawAvailability = await prisma.teacherAvailability.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    })
    const availability: TeacherAvailability[] = rawAvailability.map((s: any) => ({
      id: s.id,
      teacherId: s.teacherId,
      dayOfWeek: s.dayOfWeek,
      startTime: String(s.startTime),
      endTime: String(s.endTime)
    }))

    // 生成优化建议（只对周循环的时间段）
    const weeklyAvailability = availability.filter(item => item.dayOfWeek !== undefined)
    const optimizationSuggestions = weeklyAvailability.length > 0 ?
      generateTimeOptimizationSuggestions(teacherId, weeklyAvailability) : []

    return ok({
      availability,
      optimizationSuggestions,
      summary: {
        totalSlots: availability.length,
  totalHours: availability.reduce((sum: number, slot: TeacherAvailability) => {
          return sum + (timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / 60
        }, 0).toFixed(1),
        hasGaps: optimizationSuggestions.some(s => s.type === 'time_gap'),
        hasShortSlots: optimizationSuggestions.some(s => s.type === 'short_slots'),
        hasLongSlots: optimizationSuggestions.some(s => s.type === 'long_slots')
      }
    })

  } catch (error) {
    logger.error('availability.get.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('Failed to fetch availability', 500, E.INTERNAL_ERROR)
  }
}

// 设置教师可用性
async function setAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    // 从 URL 中提取 teacherId
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2] // /api/teachers/[id]/availability
    
    const user = request.user!
    const body = await request.json()
    const validatedData = teacherAvailabilitySchema.parse(body)

    // 检查权限 - 教师只能操作自己的资源
    if (user.role === 'teacher') {
      // 查找当前用户对应的教师记录
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher) {
        return fail('Teacher record not found', 403, E.FORBIDDEN)
      }
      
      // 确保教师只能操作自己的资源
      if (currentTeacher.id !== teacherId) {
        return fail('Teachers can only modify their own availability', 403, E.FORBIDDEN)
      }
      
      // 权限验证通过，继续执行
    }

    // 查找目标教师记录
    const targetTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId }
    })

    if (!targetTeacher) {
      return fail('Teacher record not found', 404, E.NOT_FOUND)
    }

    // 智能冲突检测和管理
    const { conflicts, overlappingSlots } = await detectAvailabilityConflicts(
      targetTeacher.id,
      validatedData
    )

    if (conflicts.length > 0) {
      const friendlyMessage = generateFriendlyConflictMessage(conflicts)
      return fail(friendlyMessage, 409, E.AVAILABILITY_CONFLICT_GENERAL, {
        conflicts,
        suggestions: generateConflictSuggestions(conflicts, validatedData),
        help: '请选择以下解决方案之一，或调整您的时间设置'
      })
    }

    // 检查是否与阻塞时间冲突
    const blockedTimeConflicts = await checkBlockedTimeConflicts(
      targetTeacher.id,
      validatedData
    )

    // 如果检测到与 blockedTime 冲突，默认允许创建（共存），但作为 warnings 返回给前端
    let blockedTimeWarnings: any[] = []
    if (blockedTimeConflicts.length > 0) {
      blockedTimeWarnings = blockedTimeConflicts
      logger.info('availability.set.blocked_time_conflicts', { count: blockedTimeConflicts.length })
    }

    // 检查是否与已有预约冲突
    const appointmentConflicts = await checkAppointmentConflicts(
      targetTeacher.id,
      validatedData
    )

    if (appointmentConflicts.length > 0) {
      const friendlyMessage = generateFriendlyConflictMessage(appointmentConflicts)
      return fail(friendlyMessage, 409, E.AVAILABILITY_CONFLICT_APPOINTMENT, {
        conflicts: appointmentConflicts,
        help: '您设置的时间段与已有预约冲突，请选择其他时间',
        suggestions: [
            {
              action: 'choose_other_time',
              description: '选择其他时间：避开预约时间段',
              recommendation: '建议您选择一个没有预约冲突的时间段'
            },
            {
              action: 'view_schedule',
              description: '查看完整日程：了解所有预约时间',
              recommendation: '您可以先查看完整的预约安排，找到空闲时间段'
            }
          ]
      })
    }

    // 查找重叠的可用性时间段
    if (overlappingSlots.length > 0) {
      // 智能合并或分割时间段
      const mergedSlots = await mergeOverlappingSlots(
        targetTeacher.id,
        validatedData,
        overlappingSlots
      )
      
      return ok({ message: 'Availability slots merged successfully', mergedSlots, originalRequest: validatedData })
    }

    // 确保是周循环模式（系统目前只支持这种模式）
    if (validatedData.dayOfWeek === undefined) {
      return fail('dayOfWeek is required for weekly recurring availability', 400, E.AVAILABILITY_INVALID_MODE)
    }

    // 创建新的可用性记录
    const newAvailability = await prisma.teacherAvailability.create({
      data: {
        teacherId: targetTeacher.id,
        dayOfWeek: validatedData.dayOfWeek,
        startTime: validatedData.startTime,
        endTime: validatedData.endTime,
        isActive: true
      }
    })

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'set_availability',
        targetId: targetTeacher.id,
        details: JSON.stringify(validatedData),
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    })

  // 如果存在与 blockedTime 的冲突，返回 warnings 供前端提示（非阻塞）
  return ok({ availability: newAvailability, blockedTimeWarnings })

  } catch (error) {
    logger.error('availability.set.exception', { ...getRequestMeta(request), error: String(error) })
    if (error instanceof z.ZodError) {
      return fail('Invalid input data', 400, E.BAD_REQUEST, error.errors)
    }
    return fail('Failed to set availability', 500, E.INTERNAL_ERROR)
  }
}

// 批量设置可用性
async function batchSetAvailabilityHandler(request: AuthenticatedRequest, context?: any) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const teacherId = pathParts[pathParts.length - 2]
    
    const user = request.user!
    const body = await request.json()
    
    // 验证批量数据
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return fail('请提供有效的时间段数组', 400, E.BAD_REQUEST)
    }
    
    // 检查权限
    if (user.role === 'teacher') {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: user.userId }
      })
      
      if (!currentTeacher || currentTeacher.id !== teacherId) {
        return fail('您只能设置自己的可用性时间', 403, E.FORBIDDEN)
      }
    }
    
    const results = []
    const errors = []
    
    // 逐个处理每个时间段
    for (const slot of body.slots) {
      try {
        const validatedData = teacherAvailabilitySchema.parse(slot)
        
        // 检查冲突
        const { conflicts } = await detectAvailabilityConflicts(
          teacherId,
          validatedData
        )
        
        if (conflicts.length > 0) {
          errors.push({
            slot,
            conflicts: conflicts.map(c => c.message)
          })
          continue
        }
        
        // 确保是周循环模式
        if (validatedData.dayOfWeek === undefined) {
          errors.push({
            slot,
            error: 'dayOfWeek is required for weekly recurring availability'
          })
          continue
        }

        // 创建时间段
        const newSlot = await prisma.teacherAvailability.create({
          data: {
            teacherId,
            dayOfWeek: validatedData.dayOfWeek,
            startTime: validatedData.startTime,
            endTime: validatedData.endTime,
            isActive: true
          }
        })
        
        results.push(newSlot)
        
      } catch (error) {
        errors.push({
          slot,
          error: error instanceof z.ZodError ? '数据格式错误' : '处理失败'
        })
      }
    }
    
    // 记录审计日志
    if (results.length > 0) {
      await prisma.auditLog.create({
        data: {
          actorId: user.userId,
          action: 'batch_set_availability',
          targetId: teacherId,
          details: JSON.stringify({
            totalSlots: body.slots.length,
            successCount: results.length,
            errorCount: errors.length
          }),
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown'
        }
      })
    }
    
    return ok({
      message: `批量设置完成：成功 ${results.length} 个，失败 ${errors.length} 个`,
      results,
      errors,
      summary: {
        total: body.slots.length,
        success: results.length,
        failed: errors.length
      }
    })
    
  } catch (error) {
    logger.error('availability.batch.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('批量设置失败', 500, E.INTERNAL_ERROR)
  }
}

// 导出处理函数
export const GET = withRole('teacher')(getAvailabilityHandler)
export const POST = withRole('teacher')(setAvailabilityHandler)
export const PUT = withRole('teacher')(batchSetAvailabilityHandler)
