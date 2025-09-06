'use client'

import { Subject, SubjectListProps } from '@/lib/types'

export default function SubjectList({
  subjects,
  selectedSubjectIds,
  onSubjectToggle,
  onBlur,
  disabled = false,
}: SubjectListProps) {
  return (
    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2">
      {subjects.map((subject) => (
        <label key={subject.id} className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedSubjectIds.includes(subject.id)}
            onChange={() => onSubjectToggle(subject.id)}
            onBlur={onBlur}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
            {subject.name}
          </span>
        </label>
      ))}
    </div>
  )
}
