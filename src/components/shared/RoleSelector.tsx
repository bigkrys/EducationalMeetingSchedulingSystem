'use client'

import { Select } from 'antd'

const { Option } = Select

interface RoleSelectorProps {
  value: 'student' | 'teacher'
  onChange: (role: 'student' | 'teacher') => void
}

export default function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
      <Select
        value={value}
        onChange={onChange}
        placeholder="请选择角色"
        size="large"
        className="w-full"
      >
        <Option value="student">学生</Option>
        <Option value="teacher">教师</Option>
        {/* 管理员账户不能通过注册创建 */}
      </Select>
    </div>
  )
}
