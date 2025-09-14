'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminUsers from '@/app/admin/users/page'

export default function DashboardAdminUsers() {
  return (
    <AdminGuard>
      <AdminUsers />
    </AdminGuard>
  )
}
