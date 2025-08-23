'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'antd'
import { 
  DashboardOutlined, 
  UserOutlined, 
  SettingOutlined, 
  FileTextOutlined,
  BarChartOutlined
} from '@ant-design/icons'

const navigation = [
  {
    name: '仪表板',
    href: '/admin',
    icon: DashboardOutlined
  },
  {
    name: '用户管理',
    href: '/admin/users',
    icon: UserOutlined
  },
  {
    name: '策略管理',
    href: '/admin/policies',
    icon: SettingOutlined
  },
  {
    name: '审计日志',
    href: '/admin/audit-logs',
    icon: FileTextOutlined
  },
  {
    name: '系统监控',
    href: '/admin/monitoring',
    icon: BarChartOutlined
  }
]

export default function AdminNavigation() {
  const pathname = usePathname()

  const menuItems = navigation.map((item) => ({
    key: item.href,
    icon: <item.icon />,
    label: (
      <Link href={item.href} style={{ color: 'inherit' }}>
        {item.name}
      </Link>
    )
  }))

  return (
    <Menu
      mode="inline"
      selectedKeys={[pathname]}
      items={menuItems}
      style={{ border: 'none', backgroundColor: 'transparent' }}
    />
  )
}
