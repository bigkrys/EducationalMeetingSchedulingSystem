import { prisma } from '@/lib/api/db'
import { addMinutes, startOfDay, endOfDay, parseISO, getDay } from 'date-fns'

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

  // 生成所有可能的时间槽
  const allSlots: Date[] = []
  let currentTime = new Date(slotStart)
  
  while (currentTime < slotEnd) {
    allSlots.push(new Date(currentTime))
    currentTime = addMinutes(currentTime, duration)
  }

  // 过滤掉超出结束时间的槽位
  const validSlots = allSlots.filter(slot => {
    const slotEndTime = addMinutes(slot, duration)
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
    const slotEndTime = addMinutes(slot, duration)
    
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
