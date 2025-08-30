import { NextRequest, NextResponse } from 'next/server'

// 简单的健康检查/占位路由，避免构建失败（可按需扩展为用户时区设置接口）
export async function GET(req: NextRequest) {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
		return NextResponse.json({ timezone: tz })
	} catch {
		return NextResponse.json({ timezone: 'UTC' })
	}
}

