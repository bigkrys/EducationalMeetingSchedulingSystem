'use client'

export const dynamic = 'force-dynamic'

import { AdminGuard } from '@/components/shared/AuthGuard'
import AdminAnalyticsPage from '@/app/admin/analytics/page'

export default function DashboardAdminAnalytics() {
  return (
    <AdminGuard>
      <AdminAnalyticsPage />
    </AdminGuard>
  )
}
