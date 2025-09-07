// Lightweight unit test for promoteForSlotTx logic
import { promoteForSlotTx } from '../src/lib/waitlist/promotion.ts'

function assert(condition: any, message: string) {
  if (!condition) throw new Error('Assertion failed: ' + message)
}

async function main() {
  const calls: Record<string, number> = {}
  const inc = (k: string) => (calls[k] = (calls[k] || 0) + 1)

  const now = new Date()
  const slot = new Date(now.getTime() + 3600 * 1000)

  // fake tx
  const tx: any = {
    $queryRawUnsafe: async (_q: string, _tId: string, _slot: Date) => [
      { id: 'wl1', studentId: 'stuC', createdAt: new Date(now.getTime() - 10000) },
    ],
    appointment: {
      _existing: { id: 'apt1', status: 'cancelled', teacherId: 't1', scheduledTime: slot },
      findFirst: async ({ where }: any) =>
        where.teacherId === 't1' ? (tx.appointment._existing as any) : null,
      update: async ({ where, data }: any) => {
        inc('appointment.update')
        assert(where.id === 'apt1', 'update should target existing appointment')
        assert(data.studentId === 'stuC', 'update should assign student C')
        return { id: 'apt1', status: data.status }
      },
      create: async (_: any) => {
        inc('appointment.create')
        return { id: 'aptX', status: 'pending' }
      },
    },
    student: {
      _rec: {
        id: 'stuC',
        serviceLevel: 'level1',
        monthlyMeetingsUsed: 3,
        lastQuotaReset: new Date(now.getTime() - 86400000),
      },
      findUnique: async ({ where }: any) => (where.id === 'stuC' ? (tx.student._rec as any) : null),
      update: async () => {
        inc('student.update')
      },
    },
    subject: {
      findFirst: async ({ where }: any) => (where.name ? { id: 'sub1', name: where.name } : null),
    },
    servicePolicy: {
      findUnique: async ({ where }: any) =>
        where.level === 'level1' ? { monthlyAutoApprove: 2 } : null,
    },
    waitlist: {
      delete: async ({ where }: any) => {
        inc('waitlist.delete')
        assert(where.id === 'wl1', 'should delete promoted waitlist entry id=wl1')
      },
      deleteMany: async ({ where }: any) => {
        inc('waitlist.deleteMany')
        assert(where.studentId === 'stuC', 'should cleanup same slot entries for student')
      },
    },
    auditLog: {
      create: async () => {
        inc('auditLog.create')
      },
    },
  }

  const res = await promoteForSlotTx(tx, 't1', slot, 'Math')
  assert(res.promoted === 1, 'should promote one student')
  assert(calls['appointment.update'] === 1, 'should reuse existing cancelled appointment')
  assert(!calls['appointment.create'], 'should not create new appointment due to unique constraint')
  assert(
    calls['waitlist.delete'] === 1 && calls['waitlist.deleteMany'] === 1,
    'should cleanup waitlist'
  )
  console.log('OK promoteForSlotTx: reuse-cancelled-update-path')

  // Case 2: no existing appointment -> create path
  calls['appointment.update'] = 0
  calls['appointment.create'] = 0
  const tx2: any = {
    $queryRawUnsafe: async () => [
      { id: 'wl2', studentId: 'stuD', createdAt: new Date(now.getTime() - 5000) },
    ],
    appointment: {
      findFirst: async () => null,
      update: async () => {
        calls['appointment.update'] = (calls['appointment.update'] || 0) + 1
        return { id: 'apt2', status: 'pending' }
      },
      create: async () => {
        calls['appointment.create'] = (calls['appointment.create'] || 0) + 1
        return { id: 'apt2', status: 'pending' }
      },
    },
    student: {
      _rec: {
        id: 'stuD',
        serviceLevel: 'level2',
        monthlyMeetingsUsed: 0,
        lastQuotaReset: new Date(now.getTime() - 86400000),
      },
      findUnique: async () => ({
        id: 'stuD',
        serviceLevel: 'level2',
        monthlyMeetingsUsed: 0,
        lastQuotaReset: new Date(now.getTime() - 86400000),
      }),
      update: async () => {},
    },
    subject: { findFirst: async () => ({ id: 'sub1' }) },
    servicePolicy: { findUnique: async () => ({ monthlyAutoApprove: 2 }) },
    waitlist: {
      delete: async () => {},
      deleteMany: async () => {},
    },
    auditLog: { create: async () => {} },
  }
  const res2 = await promoteForSlotTx(tx2, 't1', slot, 'Math')
  assert(res2.promoted === 1, 'create path should promote')
  assert(calls['appointment.create'] === 1, 'should create appointment when none exists')
  console.log('OK promoteForSlotTx: create-new-path')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
