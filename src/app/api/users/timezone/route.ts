import { NextRequest, NextResponse } from 'next/server'
import { ok } from '@/lib/api/response'

// 简单的健康检查/占位路由，避免构建失败（可按需扩展为用户时区设置接口）
export async function GET(req: NextRequest) {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
		return ok({ timezone: tz })
	} catch {
		return ok({ timezone: 'UTC' })
	}
}
