import fetch from 'node-fetch'

// 配置
const BASE = process.env.BASE_URL || 'http://localhost:3000'

const accounts = [
  { email: 'krysliang@163.com', password: 'ASDF1234' },
  { email: '709593732@qq.com', password: 'ASDF1234' }
]

// 需要替换为目标 teacherId 与 slot
const TEST_TEACHER_ID = process.env.TEST_TEACHER_ID || ''
const TEST_SUBJECT = process.env.TEST_SUBJECT || 'Math'
const TEST_SCHEDULED_TIME = process.env.TEST_SCHEDULED_TIME || '' // ISO string
const TEST_DURATION = Number(process.env.TEST_DURATION || '30')
const IDEMPOTENCY_KEY_PREFIX = 'concurrent-test-'

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  let body: any = {}
  try {
    body = await res.json()
  } catch (e) {
    // non-json response
    body = { raw: await res.text().catch(() => '') }
  }
  return { status: res.status, body }
}

async function createAppointment(token: string, studentId: string, teacherId: string, subject: string, scheduledTime: string, durationMinutes: number, idempotencyKey: string) {
  try {
    const res = await fetch(`${BASE}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ studentId, teacherId, subject, scheduledTime, durationMinutes, idempotencyKey })
    })
    let body: any = {}
    try { body = await res.json() } catch (e) { body = { raw: await res.text().catch(() => '') } }
    return { status: res.status, body }
  } catch (err: any) {
    return { status: 0, body: { error: 'NETWORK_ERROR', message: String(err) } }
  }
}

async function main() {
  if (!TEST_TEACHER_ID || !TEST_SCHEDULED_TIME) {
    console.error('请先在环境变量中设置 TEST_TEACHER_ID 和 TEST_SCHEDULED_TIME（ISO 字符串）')
    process.exit(1)
  }

  console.log('登录两个账号...')
  const logins = await Promise.all(accounts.map(a => login(a.email, a.password)))
  console.log('登录结果：', JSON.stringify(logins, null, 2))

  // 解析 token
  const tokens = logins.map(l => (l && l.body && (l.body.accessToken || l.body.access_token)) ? (l.body.accessToken || l.body.access_token) : '')

  // 使用 token 获取当前用户信息以获得 studentId（更可靠）
  const studentIds: string[] = []
  for (const token of tokens) {
    if (!token) {
      studentIds.push('')
      continue
    }
    try {
      const meRes = await fetch(`${BASE}/api/users/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })
  const meJson: any = await meRes.json().catch(() => ({}))
  const extractedStudentId = meJson && (meJson.student?.id || meJson.id || (meJson.user && meJson.user.id)) ? (meJson.student?.id || meJson.id || meJson.user.id) : ''
  studentIds.push(extractedStudentId)
    } catch (e) {
      studentIds.push('')
    }
  }

  console.log('准备并发创建预约...')

  const idempotencyKeys = studentIds.map((id, i) => `${IDEMPOTENCY_KEY_PREFIX}${Date.now()}-${i}`)

  const promises = tokens.map((token, i) => createAppointment(
    token,
    studentIds[i],
    TEST_TEACHER_ID,
    TEST_SUBJECT,
    TEST_SCHEDULED_TIME,
    TEST_DURATION,
    idempotencyKeys[i]
  ))

  const results = await Promise.all(promises)
  console.log('并发请求结果:')
  results.forEach((r, i) => console.log(`Account ${accounts[i].email}: status=${r.status}`, r.body))
}

main().catch(err => { console.error(err); process.exit(1) })
