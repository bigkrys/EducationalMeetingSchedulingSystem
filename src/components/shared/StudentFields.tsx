'use client'

import { Select, InputNumber } from 'antd'

const { Option } = Select

interface StudentFieldsProps {
  serviceLevel: 'level1' | 'level2' | 'premium'
  enrolledSubjects: string[]
  onServiceLevelChange: (level: 'level1' | 'level2' | 'premium') => void
  onEnrolledSubjectsChange: (subjects: string[]) => void
}

export default function StudentFields({
  serviceLevel,
  enrolledSubjects,
  onServiceLevelChange,
  onEnrolledSubjectsChange
}: StudentFieldsProps) {
  const subjects = [
    '数学', '物理', '化学', '生物', '语文', '英语', '历史', '地理', 
    '政治', '计算机科学', '经济学', '心理学', '艺术', '音乐', '体育'
  ]

  return (
    <div className="space-y-4">
      {/* 服务级别 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">服务级别</label>
        <Select
          value={serviceLevel}
          onChange={onServiceLevelChange}
          placeholder="请选择服务级别"
          size="large"
          className="w-full"
        >
          <Option value="level1">一级 - 每月2次自动批准</Option>
          <Option value="level2">二级 - 需要教师审批</Option>
          <Option value="premium">高级 - 优先预约，自动批准</Option>
        </Select>
      </div>

      {/* 已注册科目 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">已注册科目</label>
        <Select
          mode="multiple"
          value={enrolledSubjects}
          onChange={onEnrolledSubjectsChange}
          placeholder="请选择已注册的科目"
          size="large"
          className="w-full"
          options={subjects.map(subject => ({ label: subject, value: subject }))}
        />
      </div>
    </div>
  )
}
