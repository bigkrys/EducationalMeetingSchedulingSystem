import React from 'react'
import { Tag, Tooltip } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import {
  formatUtcToLocal,
  getLocalTimeOnly,
  getLocalDateOnly,
  getRelativeTime,
  getUserTimezone,
  getTimezoneInfo,
} from '@/lib/utils/timezone-client'

interface TimezoneDisplayProps {
  utcTime: string | Date
  format?: 'full' | 'time' | 'date' | 'relative'
  showTimezone?: boolean
  showTooltip?: boolean
  className?: string
}

/**
 * 时区感知的时间显示组件
 * 自动将UTC时间转换为用户本地时间显示
 */
export default function TimezoneDisplay({
  utcTime,
  format = 'full',
  showTimezone = false,
  showTooltip = true,
  className,
}: TimezoneDisplayProps) {
  const timezoneInfo = getTimezoneInfo()

  // 获取格式化的本地时间
  const getFormattedTime = () => {
    switch (format) {
      case 'time':
        return getLocalTimeOnly(utcTime)
      case 'date':
        return getLocalDateOnly(utcTime)
      case 'relative':
        return getRelativeTime(utcTime)
      case 'full':
      default:
        return formatUtcToLocal(utcTime)
    }
  }

  const formattedTime = getFormattedTime()
  const utcString = typeof utcTime === 'string' ? utcTime : utcTime.toISOString()

  const timeDisplay = (
    <span className={className}>
      {formattedTime}
      {showTimezone && (
        <Tag
          color="blue"
          style={{ marginLeft: 8, fontSize: '12px' }}
          icon={<ClockCircleOutlined />}
        >
          {timezoneInfo.offset}
        </Tag>
      )}
    </span>
  )

  if (showTooltip) {
    return (
      <Tooltip
        title={
          <div>
            <div>本地时间: {formatUtcToLocal(utcTime)}</div>
            <div>UTC时间: {utcString}</div>
            <div>
              时区: {timezoneInfo.timezone} ({timezoneInfo.name})
            </div>
          </div>
        }
      >
        {timeDisplay}
      </Tooltip>
    )
  }

  return timeDisplay
}

/**
 * 时间槽显示组件
 * 专门用于显示可预约的时间段
 */
export function TimeSlotDisplay({
  startTime,
  endTime,
  className,
  showDuration = true,
}: {
  startTime: string | Date
  endTime: string | Date
  className?: string
  showDuration?: boolean
}) {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60))

  return (
    <div className={className}>
      <span style={{ fontWeight: 500 }}>
        {getLocalTimeOnly(startTime)} - {getLocalTimeOnly(endTime)}
      </span>
      {showDuration && <Tag style={{ marginLeft: 8, fontSize: '12px' }}>{duration}分钟</Tag>}
    </div>
  )
}

/**
 * 预约时间显示组件
 * 显示预约的完整时间信息
 */
export function AppointmentTimeDisplay({
  scheduledTime,
  durationMinutes = 30,
  status,
  className,
}: {
  scheduledTime: string | Date
  durationMinutes?: number
  status?: string
  className?: string
}) {
  const startTime = new Date(scheduledTime)
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'orange'
      case 'approved':
        return 'green'
      case 'completed':
        return 'blue'
      case 'cancelled':
        return 'red'
      case 'expired':
        return 'default'
      default:
        return 'default'
    }
  }

  return (
    <div className={className}>
      <div style={{ marginBottom: 4 }}>
        <TimezoneDisplay utcTime={scheduledTime} format="full" showTooltip={true} />
      </div>
      <div>
        <TimeSlotDisplay startTime={scheduledTime} endTime={endTime} showDuration={true} />
        {status && (
          <Tag color={getStatusColor()} style={{ marginLeft: 8 }}>
            {status}
          </Tag>
        )}
      </div>
    </div>
  )
}
