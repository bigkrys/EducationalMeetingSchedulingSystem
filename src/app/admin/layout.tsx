import AdminNavigation from '@/components/admin/AdminNavigation'
import { Layout, Typography } from 'antd'

const { Sider, Content } = Layout
const { Title } = Typography

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider 
        width={256} 
        style={{ 
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRight: '1px solid #f0f0f0'
        }}
      >
        <div style={{ padding: '24px' }}>
          <Title level={4} style={{ marginBottom: '24px', color: '#1890ff' }}>
            管理员控制台
          </Title>
          <AdminNavigation />
        </div>
      </Sider>

      {/* 主内容区 */}
      <Content>
        <main style={{ minHeight: '100vh', background: '#f5f5f5' }}>
          {children}
        </main>
      </Content>
    </Layout>
  )
}
