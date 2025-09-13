'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminTasksPage from '@/app/admin/tasks/page'

export default function DashboardAdminTasks() {
  return (
    <AdminGuard>
      <AdminTasksPage />
    </AdminGuard>
  )
}
