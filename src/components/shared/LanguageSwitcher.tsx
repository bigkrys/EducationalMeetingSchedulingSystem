'use client'

import { Button } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'

export default function LanguageSwitcher() {
  return (
    <Button type="text" icon={<GlobalOutlined />} className="text-gray-600 hover:text-gray-800">
      中文
    </Button>
  )
}
