import nodemailer from 'nodemailer'

// 邮件配置
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.163.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_PORT === '465', 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  // 163邮箱特殊配置
  tls: {
    rejectUnauthorized: false // 允许自签名证书
  },
  connectionTimeout: 60000, // 连接超时60秒
  greetingTimeout: 30000,   // 问候超时30秒
  socketTimeout: 60000      // socket超时60秒
}


// 创建邮件传输器
const transporter = nodemailer.createTransport(emailConfig)

// 邮件模板
const emailTemplates = {
  appointmentApproved: {
    subject: '预约审批通过通知',
    studentTemplate: (data: any) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1890ff;">预约审批通过通知</h2>
        <p>亲爱的 ${data.studentName}，</p>
        <p>您的预约已获得教师批准！</p>
        <div style="background-color: #f6ffed; border: 1px solid #b7eb8f; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #52c41a;">预约详情</h3>
          <p><strong>教师：</strong>${data.teacherName}</p>
          <p><strong>科目：</strong>${data.subject}</p>
          <p><strong>时间：</strong>${data.scheduledTime}</p>
          <p><strong>时长：</strong>${data.durationMinutes}分钟</p>
        </div>
        <p>请按时参加课程，如有任何问题请及时联系教师。</p>
        <p>祝学习愉快！</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
        <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
      </div>
    `,
    teacherTemplate: (data: any) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1890ff;">预约审批确认通知</h2>
        <p>亲爱的 ${data.teacherName}，</p>
        <p>您已成功批准了一个预约申请。</p>
        <div style="background-color: #f6ffed; border: 1px solid #b7eb8f; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #52c41a;">预约详情</h3>
          <p><strong>学生：</strong>${data.studentName}</p>
          <p><strong>科目：</strong>${data.subject}</p>
          <p><strong>时间：</strong>${data.scheduledTime}</p>
          <p><strong>时长：</strong>${data.durationMinutes}分钟</p>
        </div>
        <p>请按时准备课程内容，如有任何问题请及时联系学生。</p>
        <p>祝教学愉快！</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
        <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
      </div>
    `
  },
  appointmentCancelled: {
    subject: '预约取消通知',
    studentTemplate: (data: any) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff4d4f;">预约取消通知</h2>
        <p>亲爱的 ${data.studentName}，</p>
        <p>您的预约已被取消。</p>
        <div style="background-color: #fff2f0; border: 1px solid #ffccc7; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #ff4d4f;">预约详情</h3>
          <p><strong>教师：</strong>${data.teacherName}</p>
          <p><strong>科目：</strong>${data.subject}</p>
          <p><strong>时间：</strong>${data.scheduledTime}</p>
          <p><strong>取消原因：</strong>${data.reason || '未提供'}</p>
        </div>
        <p>如有疑问，请联系教师或系统管理员。</p>
        <p>感谢您的理解！</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
        <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
      </div>
    `,
    teacherTemplate: (data: any) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff4d4f;">预约取消通知</h2>
        <p>亲爱的 ${data.teacherName}，</p>
        <p>一个预约已被取消。</p>
        <div style="background-color: #fff2f0; border: 1px solid #ffccc7; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #ff4d4f;">预约详情</h3>
          <p><strong>学生：</strong>${data.studentName}</p>
          <p><strong>科目：</strong>${data.subject}</p>
          <p><strong>时间：</strong>${data.scheduledTime}</p>
          <p><strong>取消原因：</strong>${data.reason || '未提供'}</p>
        </div>
        <p>如有疑问，请联系学生或系统管理员。</p>
        <p>感谢您的理解！</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
        <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
      </div>
    `
  }
}

// 发送邮件
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const mailOptions = {
      from: `"教育会议调度系统" <${emailConfig.auth.user}>`,
      to,
      subject,
      html
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent successfully:', info.messageId)
    return true
  } catch (error) {
    console.error('Failed to send email:', error)
    return false
  }
}

// 发送预约审批通过通知
export async function sendAppointmentApprovedNotification(
  studentEmail: string,
  teacherEmail: string,
  data: {
    studentName: string
    teacherName: string
    subject: string
    scheduledTime: string
    durationMinutes: number
  }
): Promise<void> {
  try {
    // 发送给学生
    await sendEmail(
      studentEmail,
      emailTemplates.appointmentApproved.subject,
      emailTemplates.appointmentApproved.studentTemplate(data)
    )

    // 发送给教师
    await sendEmail(
      teacherEmail,
      emailTemplates.appointmentApproved.subject,
      emailTemplates.appointmentApproved.teacherTemplate(data)
    )

    console.log('Appointment approved notifications sent successfully')
  } catch (error) {
    console.error('Failed to send appointment approved notifications:', error)
  }
}

// 发送预约取消通知
export async function sendAppointmentCancelledNotification(
  studentEmail: string,
  teacherEmail: string,
  data: {
    studentName: string
    teacherName: string
    subject: string
    scheduledTime: string
    reason?: string
  }
): Promise<void> {
  try {
    // 发送给学生
    await sendEmail(
      studentEmail,
      emailTemplates.appointmentCancelled.subject,
      emailTemplates.appointmentCancelled.studentTemplate(data)
    )

    // 发送给教师
    await sendEmail(
      teacherEmail,
      emailTemplates.appointmentCancelled.subject,
      emailTemplates.appointmentCancelled.teacherTemplate(data)
    )

    console.log('Appointment cancelled notifications sent successfully')
  } catch (error) {
    console.error('Failed to send appointment cancelled notifications:', error)
  }
}

// 发送预约被拒绝通知
export async function sendAppointmentRejectedNotification(
  studentEmail: string,
  teacherEmail: string,
  data: {
    studentName: string
    teacherName: string
    subject: string
    scheduledTime: string
    reason: string
  }
): Promise<void> {
  try {
    // 发送给学生
    await sendEmail(
      studentEmail,
      '预约被拒绝通知',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">预约被拒绝通知</h2>
          <p>亲爱的 ${data.studentName}，</p>
          <p>很抱歉，您的预约请求已被拒绝。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>预约详情：</strong></p>
            <p><strong>教师：</strong>${data.teacherName}</p>
            <p><strong>科目：</strong>${data.subject}</p>
            <p><strong>时间：</strong>${data.scheduledTime}</p>
            <p><strong>拒绝原因：</strong>${data.reason}</p>
          </div>
          <p>您可以：</p>
          <ul>
            <li>选择其他时间重新预约</li>
            <li>联系教师了解具体原因</li>
            <li>选择其他教师或科目</li>
          </ul>
          <p>如有疑问，请联系系统管理员。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
          <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
        </div>
      `
    )

    // 发送给教师
    await sendEmail(
      teacherEmail,
      '预约拒绝确认通知',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">预约拒绝确认通知</h2>
          <p>亲爱的 ${data.teacherName}，</p>
          <p>您已成功拒绝了学生的预约请求。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>预约详情：</strong></p>
            <p><strong>学生：</strong>${data.studentName}</p>
            <p><strong>科目：</strong>${data.subject}</p>
            <p><strong>时间：</strong>${data.scheduledTime}</p>
            <p><strong>拒绝原因：</strong>${data.reason}</p>
          </div>
          <p>该时间段现在可以接受其他预约请求。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
          <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
        </div>
      `
    )

    console.log('Appointment rejected notifications sent successfully')
  } catch (error) {
    console.error('Failed to send appointment rejected notifications:', error)
  }
}

// 发送预约过期通知
export async function sendAppointmentExpiredNotification(
  studentEmail: string,
  teacherEmail: string,
  data: {
    studentName: string
    teacherName: string
    subject: string
    scheduledTime: string
  }
): Promise<void> {
  try {
    // 发送给学生
    await sendEmail(
      studentEmail,
      '预约过期通知',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ff9800;">预约过期通知</h2>
          <p>亲爱的 ${data.studentName}，</p>
          <p>您的预约请求已超过48小时未得到教师响应，系统已自动将其标记为过期。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>预约详情：</strong></p>
            <p><strong>教师：</strong>${data.teacherName}</p>
            <p><strong>科目：</strong>${data.subject}</p>
            <p><strong>时间：</strong>${data.scheduledTime}</p>
          </div>
          <p>您可以：</p>
          <ul>
            <li>重新提交预约请求</li>
            <li>选择其他时间或教师</li>
            <li>联系教师了解情况</li>
          </ul>
          <p>如有疑问，请联系系统管理员。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
          <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
        </div>
      `
    )

    // 发送给教师
    await sendEmail(
      teacherEmail,
      '预约过期通知',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ff9800;">预约过期通知</h2>
          <p>亲爱的 ${data.teacherName}，</p>
          <p>您有一个预约请求已超过48小时未响应，系统已自动将其标记为过期。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>预约详情：</strong></p>
            <p><strong>学生：</strong>${data.studentName}</p>
            <p><strong>科目：</strong>${data.subject}</p>
            <p><strong>时间：</strong>${data.scheduledTime}</p>
          </div>
          <p>该时间段现在可以接受其他预约请求。</p>
          <p>建议您及时处理未来的预约请求，避免类似情况发生。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
          <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
        </div>
      `
    )

    console.log('Appointment expired notifications sent successfully')
  } catch (error) {
    console.error('Failed to send appointment expired notifications:', error)
  }
}

// 发送新预约请求通知
export async function sendNewAppointmentRequestNotification(
  teacherEmail: string,
  data: {
    studentName: string
    subject: string
    scheduledTime: string
    durationMinutes: number
    studentEmail: string
  }
): Promise<void> {
  try {
    await sendEmail(
      teacherEmail,
      '新的预约请求通知',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1976d2;">新的预约请求通知</h2>
          <p>亲爱的老师，</p>
          <p>您收到了一个新的预约请求，需要您的审批。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>预约详情：</strong></p>
            <p><strong>学生：</strong>${data.studentName}</p>
            <p><strong>学生邮箱：</strong>${data.studentEmail}</p>
            <p><strong>科目：</strong>${data.subject}</p>
            <p><strong>时间：</strong>${data.scheduledTime}</p>
            <p><strong>时长：</strong>${data.durationMinutes}分钟</p>
          </div>
          <p>请尽快登录系统处理此预约请求。</p>
          <p>注意：预约请求将在48小时后自动过期。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">
          <p style="color: #8c8c8c; font-size: 12px;">此邮件由教育会议调度系统自动发送，请勿回复。</p>
        </div>
      `
    )

    console.log('New appointment request notification sent successfully')
  } catch (error) {
    console.error('Failed to send new appointment request notification:', error)
  }
}

// 测试邮件连接
export async function testEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify()
    console.log('Email server connection verified')
    return true
  } catch (error) {
    console.error('Email server connection failed:', error)
    return false
  }
}
