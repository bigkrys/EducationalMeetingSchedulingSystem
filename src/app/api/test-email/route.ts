import { NextRequest, NextResponse } from 'next/server'
import { testEmailConnection, sendEmail } from '@/lib/api/email'
import { withRateLimit, withValidation } from '@/lib/api/middleware'
import { prisma } from '@/lib/api/db'
import { testEmailSchema } from '@/lib/api/schemas'
import { ok, fail } from '@/lib/api/response'
import { logger, getRequestMeta } from '@/lib/logger'
import { ApiErrorCode as E } from '@/lib/api/errors'

const getHandler = async function GET(request: NextRequest) {
  try {
    const config = {
      host: process.env.SMTP_HOST || 'smtp.163.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || 'NOT_SET',
      pass: process.env.SMTP_PASS ? 'SET' : 'NOT_SET'
    }

    const connectionOk = await testEmailConnection()
    if (!connectionOk) {
      return fail('邮件服务器连接失败，请检查配置', 500, E.SMTP_CONNECTION_FAILED, {
        config,
        suggestions: [
          '1. 确认163邮箱已开启IMAP/SMTP服务',
          '2. 检查授权码是否正确',
          '3. 尝试使用端口465替代587',
          '4. 检查网络连接'
        ]
      })
    }

    return ok({ message: '邮件服务器连接正常', connection: 'OK', config })
  } catch (error) {
    logger.error('email.test_connection.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('邮件服务器测试失败', 500, E.INTERNAL_ERROR, { details: error instanceof Error ? error.message : 'Unknown error' })
  }
}

const postHandler = async function POST(request: NextRequest) {
  try {
  // withValidation middleware stores the parsed JSON on `validatedBody` to avoid
  // consuming the body twice (req.text()/req.json()). Prefer that when present.
  const body = (request as any).validatedBody ?? await request.json().catch(() => ({}))
  const { to, subject, html, message } = body || {}

    if (!to || !subject) {
      return fail('缺少必要参数：to, subject', 400, E.BAD_REQUEST)
    }

    const emailHtml = html || `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1976d2;">测试邮件</h2>
        <p>这是一封测试邮件，用于验证邮件通知系统是否正常工作。</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>主题：</strong>${subject}</p>
          <p><strong>内容：</strong>${message || '测试邮件内容'}</p>
        </div>
        <p>如果您收到这封邮件，说明邮件通知系统配置正确。</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
        <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
      </div>
    `

    const sent = await sendEmail(to, subject, emailHtml)
    if (sent) {
        try {
          await prisma.auditLog.create({
            data: {
              action: 'test_email_sent',
              targetId: to,
              details: JSON.stringify({ subject }),
              ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
          })
        } catch (e) { logger.warn('audit.test_email.write_failed', { ...getRequestMeta(request), error: String(e) }) }
      return ok({ message: '测试邮件发送成功', to, subject })
    }

    return fail('测试邮件发送失败', 500, E.EMAIL_SEND_FAILED)
  } catch (error) {
    logger.error('email.test_send.exception', { ...getRequestMeta(request), error: String(error) })
    return fail('发送测试邮件时发生错误', 500, E.EMAIL_TEST_FAILED)
  }
}

export const GET = withRateLimit()(getHandler)
export const POST = withRateLimit({ windowMs: 60 * 1000, max: 6 })(withValidation(testEmailSchema)(postHandler))
