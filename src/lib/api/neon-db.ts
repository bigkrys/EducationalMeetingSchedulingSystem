import { neon } from '@neondatabase/serverless'

// 创建 Neon 数据库连接
export function createNeonConnection() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  return neon(databaseUrl)
}

// 获取数据库连接实例
export const sql = createNeonConnection()
