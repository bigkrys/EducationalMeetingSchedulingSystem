import type { Prisma } from '@prisma/client'
import { metrics } from '@/lib/monitoring/sentry'
import * as Sentry from '@sentry/nextjs'
export type Tx = Prisma.TransactionClient

function isOccupiedStatus(status: string) {
  return status === 'pending' || status === 'approved'
}

function getMonthlyLimit(level: string | null | undefined) {
  if (level === 'premium') return 999
  if (level === 'level1') return 8
  if (level === 'level2') return 5
  return 10
}

export async function getSubjectIdByNameTx(tx: Tx, subjectName: string): Promise<string> {
  const subject = await tx.subject.findFirst({ where: { name: subjectName } })
  if (!subject) throw new Error(`Subject not found: ${subjectName}`)
  return subject.id
}

const MAX_PROMOTE_ATTEMPTS = parseInt(process.env.WAITLIST_PROMOTE_MAX_ATTEMPTS || '5', 10)

export async function promoteForSlotTx(
  tx: Tx,
  teacherId: string,
  slotDate: Date,
  subjectName: string
): Promise<{ promoted: 0 | 1; appointmentId?: string; status?: 'pending' | 'approved' }> {
  return await Sentry.startSpan({ name: 'waitlist.promote', op: 'task' }, async () => {
    for (let attempt = 0; attempt < MAX_PROMOTE_ATTEMPTS; attempt++) {
      metrics.increment('biz.waitlist.promote.attempt', 1)
      const rows = (await tx.$queryRawUnsafe(
        `SELECT "id", "studentId", "createdAt" FROM "waitlists"
       WHERE "teacherId" = $1 AND "slot" = $2
       ORDER BY "createdAt" ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
        teacherId,
        slotDate
      )) as { id: string; studentId: string; createdAt: Date }[]
      if (!rows?.length) return { promoted: 0 }
      const cand = rows[0]

      // 如果该时段已有预约且处于占用状态（pending/approved），则无需晋升
      const existing = await tx.appointment.findFirst({
        where: { teacherId, scheduledTime: slotDate },
      })
      if (existing && isOccupiedStatus(existing.status)) return { promoted: 0 }

      // 配额与策略检查
      const student = await tx.student.findUnique({ where: { id: cand.studentId } })
      if (!student) {
        await tx.waitlist.delete({ where: { id: cand.id } })
        continue
      }

      // 按月重置（简化实现）
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      if (student.lastQuotaReset < monthStart) {
        await tx.student.update({
          where: { id: student.id },
          data: { monthlyMeetingsUsed: 0, lastQuotaReset: new Date() },
        })
        student.monthlyMeetingsUsed = 0
      }

      const policy = await tx.servicePolicy.findUnique({ where: { level: student.serviceLevel } })
      const monthlyLimit = getMonthlyLimit(student.serviceLevel)
      if (student.monthlyMeetingsUsed >= monthlyLimit) {
        await tx.waitlist.delete({ where: { id: cand.id } })
        continue
      }

      // 审批策略
      let approvalRequired = true
      let status: 'pending' | 'approved' = 'pending'
      if (student.serviceLevel === 'premium') {
        approvalRequired = false
        status = 'approved'
      } else if (student.serviceLevel === 'level1') {
        const autoApproveLimit = policy?.monthlyAutoApprove || 2
        if (student.monthlyMeetingsUsed < autoApproveLimit) {
          approvalRequired = false
          status = 'approved'
        }
      }

      const subjectId = await getSubjectIdByNameTx(tx, subjectName)

      // 创建或复用预约记录（避免唯一键冲突）
      let appointment
      if (existing) {
        appointment = await tx.appointment.update({
          where: { id: existing.id },
          data: {
            studentId: cand.studentId,
            teacherId,
            subjectId,
            scheduledTime: slotDate,
            durationMinutes: 30,
            status,
            approvalRequired,
            approvedAt: status === 'approved' ? new Date() : null,
          },
        })
      } else {
        appointment = await tx.appointment
          .create({
            data: {
              studentId: cand.studentId,
              teacherId,
              subjectId,
              scheduledTime: slotDate,
              durationMinutes: 30,
              status,
              approvalRequired,
              approvedAt: status === 'approved' ? new Date() : null,
              idempotencyKey: `promote:${teacherId}:${slotDate.toISOString()}`,
            },
          })
          .catch(() => null)
        if (!appointment) return { promoted: 0 }
      }

      await tx.waitlist.delete({ where: { id: cand.id } })
      await tx.waitlist.deleteMany({ where: { studentId: cand.studentId, slot: slotDate } })
      await tx.student.update({
        where: { id: student.id },
        data: { monthlyMeetingsUsed: { increment: 1 } },
      })
      await tx.auditLog.create({
        data: {
          action: 'WAITLIST_PROMOTED',
          targetId: appointment.id,
          details: JSON.stringify({
            waitlistId: cand.id,
            teacherId,
            slot: slotDate.toISOString(),
            subject: subjectName,
          }),
        },
      })

      metrics.increment('biz.waitlist.promote.success', 1, { tags: { status } as any })
      return { promoted: 1, appointmentId: appointment.id, status }
    }

    metrics.increment('biz.waitlist.promote.empty', 1)
    return { promoted: 0 }
  })
}
