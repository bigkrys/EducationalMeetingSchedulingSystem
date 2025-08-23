export default function DashboardSkeleton() {
  return (
    <div style={{ padding: '24px' }}>
      {/* 用户信息卡片骨架屏 */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="h-6 bg-gray-200 rounded w-30 mb-4 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-15 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>

      {/* 功能菜单骨架屏 */}
      <div className="mb-8">
        <div className="h-8 bg-gray-200 rounded w-30 mb-6 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 h-30">
              <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
