import { NextRequest, NextResponse } from 'next/server'
import { testEmailConnection, sendEmail } from '@/lib/api/email'

export async function GET(request: NextRequest) {
  try {
    // 显示配置信息
    const config = {
      host: process.env.SMTP_HOST || 'smtp.163.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || 'NOT_SET',
      pass: process.env.SMTP_PASS ? 'SET' : 'NOT_SET'
    }

    console.log('Testing email with config:', config)

    // 测试邮件服务器连接
    const connectionOk = await testEmailConnection()
    
    if (!connectionOk) {
      return NextResponse.json({
        success: false,
        message: '邮件服务器连接失败，请检查配置',
        error: 'SMTP_CONNECTION_FAILED',
        config: config,
        suggestions: [
          '1. 确认163邮箱已开启IMAP/SMTP服务',
          '2. 检查授权码是否正确',
          '3. 尝试使用端口465替代587',
          '4. 检查网络连接'
        ]
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '邮件服务器连接正常',
      connection: 'OK',
      config: config
    })

  } catch (error) {
    console.error('Test email connection error:', error)
    return NextResponse.json({
      success: false,
      message: '邮件服务器测试失败',
      error: 'TEST_FAILED',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, html, message } = body

    if (!to || !subject) {
      return NextResponse.json({
        success: false,
        message: '缺少必要参数：to, subject',
        error: 'MISSING_PARAMETERS'
      }, { status: 400 })
    }

    // 如果没有提供html，使用message生成html
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

    // 发送测试邮件
    const sent = await sendEmail(to, subject, emailHtml)
    
    if (sent) {
      return NextResponse.json({
        success: true,
        message: '测试邮件发送成功',
        to,
        subject
      })
    } else {
      return NextResponse.json({
        success: false,
        message: '测试邮件发送失败',
        error: 'SEND_FAILED'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Send test email error:', error)
    return NextResponse.json({
      success: false,
      message: '发送测试邮件时发生错误',
      error: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}
