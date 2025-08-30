import { prisma } from '@/lib/api/db'
import { addMinutes, startOfDay, endOfDay, parseISO, getDay } from 'date-fns'
import { DEFAULT_BUFFER_MINUTES } from '@/constants'

export async function calculateAvailableSlots(teacher: any, date: string, duration: number) {
  const targetDate = parseISO(date)
  const dayOfWeek = getDay(targetDate) // 0 = 周日, 1 = 周一, ...
  
  // 查找该日期的可用时间
  const dayAvailability = teacher.availability.find((avail: any) => avail.dayOfWeek === dayOfWeek)
  
  if (!dayAvailability) {
    return [] // 该日期没有可用时间
  }

  // 解析开始和结束时间
  const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number)
  const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number)
  
  // 创建时间范围
  const dayStart = startOfDay(targetDate)
  const slotStart = new Date(dayStart)
  slotStart.setHours(startHour, startMinute, 0, 0)
  
  const slotEnd = new Date(dayStart)
  slotEnd.setHours(endHour, endMinute, 0, 0)

  // 校验 duration，确保为正整数；否则回退到 30 分钟
  let slotDuration = Number(duration)
  if (!Number.isFinite(slotDuration) || slotDuration <= 0) {
    slotDuration = 30
  } else {
    slotDuration = Math.max(1, Math.floor(slotDuration))
  }

  // 生成所有可能的时间槽（基于分钟差的循环）
  // 使用更细的步长以支持 buffer 导致的非整块偏移（例如已有 9:00-9:30 的预约且 buffer=15，
  // 期望可预约开始于 9:45）。步长取 duration 与 buffer 的最小值，至少为1。
  const allSlots: Date[] = []
  const totalMinutes = Math.floor((slotEnd.getTime() - slotStart.getTime()) / 60000)
  const bufferMinutes = Number.isFinite(Number(teacher.bufferMinutes)) ? Number(teacher.bufferMinutes) : DEFAULT_BUFFER_MINUTES
  // 使用 slotDuration 与 bufferMinutes 的最大公约数作为步长，这样可以支持由 buffer 导致的偏移
  // 例如 slotDuration=30, buffer=15 -> gcd=15，会生成 9:00,9:15,9:30,9:45 等起始时间
  const gcd = (a: number, b: number) => {
    a = Math.abs(a)
    b = Math.abs(b)
    if (b === 0) return a
    while (b) {
      const t = b
      b = a % b
      a = t
    }
    return a || 1
  }
  const stepMinutes = Math.max(1, gcd(slotDuration, bufferMinutes))

  for (let offset = 0; offset + slotDuration <= totalMinutes; offset += stepMinutes) {
    allSlots.push(addMinutes(slotStart, offset))
  }

  // 过滤掉超出结束时间的槽位
  const validSlots = allSlots.filter(slot => {
    const slotEndTime = addMinutes(slot, slotDuration)
    return slotEndTime <= slotEnd
  })

  // 获取阻塞时间
  const blockedTimes = teacher.blockedTimes.filter((block: any) => {
    const blockStart = new Date(block.startTime)
    const blockEnd = new Date(block.endTime)
    const dayStart = startOfDay(targetDate)
    const dayEnd = endOfDay(targetDate)
    
    return blockStart < dayEnd && blockEnd > dayStart
  })

  // 获取已有预约
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      teacherId: teacher.id,
      scheduledTime: {
        gte: startOfDay(targetDate),
        lt: endOfDay(targetDate)
      },
      status: { in: ['pending', 'approved'] }
    }
  })

  // 过滤掉被阻塞或被占用的时间槽
  const availableSlots = validSlots.filter(slot => {
  const slotEndTime = addMinutes(slot, slotDuration)
    
    // 检查是否与阻塞时间冲突
    const isBlocked = blockedTimes.some((block: any) => {
      const blockStart = new Date(block.startTime)
      const blockEnd = new Date(block.endTime)
      return slot < blockEnd && slotEndTime > blockStart
    })
    
    if (isBlocked) return false
    
    // 检查是否与已有预约冲突（包含缓冲时间）
  const bufferStart = addMinutes(slot, -teacher.bufferMinutes)
  const bufferEnd = addMinutes(slotEndTime, teacher.bufferMinutes)
    
    const hasConflict = existingAppointments.some((apt: any) => {
  const aptEnd = addMinutes(apt.scheduledTime, apt.durationMinutes)
      return bufferStart < aptEnd && bufferEnd > apt.scheduledTime
    })
    
    if (hasConflict) return false
    
    return true
  })

  // 转换为ISO字符串并返回
  return availableSlots.map(slot => slot.toISOString())
}
