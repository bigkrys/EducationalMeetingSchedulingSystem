'use client'

import { Select, InputNumber } from 'antd'

const { Option } = Select

interface TeacherFieldsProps {
  subjects: string[]
  maxDailyMeetings: number
  bufferMinutes: number
  onSubjectsChange: (subjects: string[]) => void
  onMaxDailyMeetingsChange: (value: number) => void
  onBufferMinutesChange: (value: number) => void
}

export default function TeacherFields({
  subjects,
  maxDailyMeetings,
  bufferMinutes,
  onSubjectsChange,
  onMaxDailyMeetingsChange,
  onBufferMinutesChange
}: TeacherFieldsProps) {
  const availableSubjects = [
    '数学', '物理', '化学', '生物', '语文', '英语', '历史', '地理', 
    '政治', '计算机科学', '经济学', '心理学', '艺术', '音乐', '体育'
  ]

  return (
    <div className="space-y-4">
      {/* 教授科目 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">教授科目</label>
        <Select
          mode="multiple"
          value={subjects}
          onChange={onSubjectsChange}
          placeholder="请选择教授的科目"
          size="large"
          className="w-full"
          options={availableSubjects.map(subject => ({ label: subject, value: subject }))}
        />
      </div>

      {/* 每日最大预约数 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">每日最大预约数</label>
        <InputNumber
          value={maxDailyMeetings}
          onChange={(value) => onMaxDailyMeetingsChange(value || 6)}
          min={1}
          max={12}
          size="large"
          className="w-full"
          placeholder="请输入每日最大预约数"
        />
      </div>

      {/* 缓冲时间 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">缓冲时间（分钟）</label>
        <InputNumber
          value={bufferMinutes}
          onChange={(value) => onBufferMinutesChange(value || 15)}
          min={0}
          max={60}
          size="large"
          className="w-full"
          placeholder="请输入缓冲时间"
        />
        <p className="text-xs text-gray-500 mt-1">
          预约之间的缓冲时间，避免时间冲突
        </p>
      </div>
    </div>
  )
}
