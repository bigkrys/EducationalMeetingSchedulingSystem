'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminAuditLogsPage from '@/app/admin/audit-logs/page'

export default function DashboardAdminAuditLogs() {
  return (
    <AdminGuard>
      <AdminAuditLogsPage />
    </AdminGuard>
  )
}
