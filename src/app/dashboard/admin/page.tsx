'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminHome from '@/app/admin/page'

export default function DashboardAdminHome() {
  return (
    <AdminGuard>
      <AdminHome />
    </AdminGuard>
  )
}
