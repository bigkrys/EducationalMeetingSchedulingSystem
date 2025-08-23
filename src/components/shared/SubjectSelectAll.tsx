'use client'

import { SubjectSelectAllProps } from '@/lib/types'

export default function SubjectSelectAll({ isAllSelected, onSelectAll, disabled = false }: SubjectSelectAllProps) {
  return (
    <div className="border border-gray-200 rounded-md p-3 mb-2">
      <label className="flex items-center space-x-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={onSelectAll}
          disabled={disabled}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
        />
        <span className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
          全选所有科目
        </span>
      </label>
    </div>
  )
}
