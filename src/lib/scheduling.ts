import { prisma } from '@/lib/api/db'
import { addMinutes, parseISO, getDay } from 'date-fns'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'
import { DEFAULT_BUFFER_MINUTES } from '@/constants'

export async function calculateAvailableSlots(teacher: any, date: string, duration: number) {
  // 教师时区（如果缺省则回退到 UTC）
  const tz = teacher.timezone || 'UTC'

  // 将教师本地的当天 00:00 转换为 UTC instant，用它作为当日范围的起点
  // 注意：date 参数预期为 YYYY-MM-DD（日期字符串）
  const dayStartUtc = zonedTimeToUtc(`${date}T00:00:00`, tz)
  // 获取该瞬时在教师时区的本地表示以计算星期几
  const dayStartInTz = utcToZonedTime(dayStartUtc, tz)
  const dayOfWeek = getDay(dayStartInTz) // 0 = 周日, 1 = 周一, ...

  // 查找该日期的可用时间（基于教师本地的星期几）
  const dayAvailability = teacher.availability.find((avail: any) => avail.dayOfWeek === dayOfWeek)
  
  if (!dayAvailability) {
    return [] // 该日期没有可用时间
  }

  // 解析开始和结束时间
  const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number)
  const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number)
  
  // 按教师时区构造具体的开始/结束瞬时（UTC）——以教师本地时间为准再转换为 UTC
  const slotStart = zonedTimeToUtc(`${date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`, tz)
  const slotEnd = zonedTimeToUtc(`${date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`, tz)

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
  // 计算教师当天在 UTC 的范围（[dayStartUtc, dayStartUtc + 24h)）
  const dayRangeStart = dayStartUtc
  const dayRangeEnd = addMinutes(dayRangeStart, 24 * 60)

  // 过滤出与该教师本地日期有交集的阻塞时间（blockedTimes 存储为 ISO/UTC）
  const blockedTimes = teacher.blockedTimes.filter((block: any) => {
    const blockStart = new Date(block.startTime)
    const blockEnd = new Date(block.endTime)
    return blockStart < dayRangeEnd && blockEnd > dayRangeStart
  })

  // 获取已有预约
  // 查询数据库中落在该教师本地日期范围内的预约（数据库中的时间为 UTC instant）
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      teacherId: teacher.id,
      scheduledTime: {
        gte: dayRangeStart,
        lt: dayRangeEnd
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
