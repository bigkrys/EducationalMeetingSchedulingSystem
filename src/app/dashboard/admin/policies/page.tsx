'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminPoliciesPage from '@/app/admin/policies/page'

export default function DashboardAdminPolicies() {
  return (
    <AdminGuard>
      <AdminPoliciesPage />
    </AdminGuard>
  )
}
