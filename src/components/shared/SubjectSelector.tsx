'use client'

import { Select } from 'antd'
import { useEffect, useState } from 'react'

interface Subject {
  id: string
  name: string
  code: string
}

interface SubjectSelectorProps {
  value: string[]
  onChange: (subjects: string[]) => void
  placeholder?: string
  mode?: 'multiple' | 'tags'
  disabled?: boolean
}

export default function SubjectSelector({
  value,
  onChange,
  placeholder = '请选择科目',
  mode = 'multiple',
  disabled = false,
}: SubjectSelectorProps) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSubjects()
  }, [])

  const fetchSubjects = async () => {
    try {
      const response = await fetch('/api/subjects')
      if (response.ok) {
        const data = await response.json()
        setSubjects(data)
      }
    } catch (error) {
      console.error('Failed to fetch subjects:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">科目</label>
      <Select
        mode={mode}
        value={value}
        onChange={onChange}
        placeholder={loading ? '加载中...' : placeholder}
        disabled={disabled || loading}
        size="large"
        className="w-full"
        loading={loading}
        options={subjects.map((subject) => ({
          label: subject.name,
          value: subject.id,
        }))}
      />
    </div>
  )
}
