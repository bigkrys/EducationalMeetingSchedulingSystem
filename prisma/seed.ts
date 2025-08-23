import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // 创建科目
  console.log('📚 Creating subjects...')
  const subjects = [
    { name: '数学', code: 'MATH', description: '数学基础与应用' },
    { name: '物理', code: 'PHYSICS', description: '物理学基础' },
    { name: '化学', code: 'CHEMISTRY', description: '化学基础' },
    { name: '生物', code: 'BIOLOGY', description: '生物学基础' },
    { name: '语文', code: 'CHINESE', description: '中文语言文学' },
    { name: '英语', code: 'ENGLISH', description: '英语语言学习' },
    { name: '历史', code: 'HISTORY', description: '历史学基础' },
    { name: '地理', code: 'GEOGRAPHY', description: '地理学基础' },
    { name: '政治', code: 'POLITICS', description: '政治学基础' },
    { name: '计算机科学', code: 'COMPUTER_SCIENCE', description: '计算机科学基础' }
  ]

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: subject,
      create: subject
    })
  }
  console.log('✅ Subjects created')

  // 创建简单的测试用户
  console.log('👥 Creating test users...')
  
  // 创建学生用户 - 使用明文密码（仅用于测试）
  const studentUser = await prisma.user.upsert({
    where: { email: 'student@test.com' },
    update: {
      passwordHash: 'Password123', // 强制更新密码
      status: 'active'
    },
    create: {
      email: 'student@test.com',
      passwordHash: 'Password123', // 明文密码，仅用于测试
      role: 'student',
      status: 'active',
      name: '测试学生'
    }
  })

  // 创建教师用户 - 使用明文密码（仅用于测试）
  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@test.com' },
    update: {
      passwordHash: 'Password123', // 强制更新密码
      status: 'active'
    },
    create: {
      email: 'teacher@test.com',
      passwordHash: 'Password123', // 明文密码，仅用于测试
      role: 'teacher',
      status: 'active',
      name: '测试教师'
    }
  })

  console.log('✅ Test users created')

  // 创建教师记录
  console.log('👨‍🏫 Creating teacher profile...')
  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      maxDailyMeetings: 6,
      bufferMinutes: 15,
      timezone: 'Asia/Shanghai'
    }
  })

  // 创建学生记录
  console.log('👨‍🎓 Creating student profile...')
  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      serviceLevel: 'level1',
      monthlyMeetingsUsed: 0,
      lastQuotaReset: new Date(),
      gradeLevel: 10
    }
  })

  console.log('✅ User profiles created')

  // 创建管理员用户
  console.log('👑 Creating admin user...')
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@edu.com' },
    update: {
      passwordHash: 'admin123', // 强制更新密码
      status: 'active'
    },
    create: {
      email: 'admin@edu.com',
      passwordHash: 'admin123', // 明文密码，仅用于测试
      role: 'admin',
      status: 'active',
      name: '系统管理员'
    }
  })

  // 创建管理员记录
  const admin = await prisma.admin.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      scope: JSON.stringify({ all: true })
    }
  })
  console.log('✅ Admin user created')

  // 关联教师和科目
  console.log('🔗 Linking teacher to subjects...')
  const mathSubject = await prisma.subject.findUnique({ where: { code: 'MATH' } })
  const physicsSubject = await prisma.subject.findUnique({ where: { code: 'PHYSICS' } })

  if (mathSubject && physicsSubject) {
    await prisma.teacherSubject.upsert({
      where: {
        teacherId_subjectId: {
          teacherId: teacher.id,
          subjectId: mathSubject.id
        }
      },
      update: {},
      create: {
        teacherId: teacher.id,
        subjectId: mathSubject.id
      }
    })

    await prisma.teacherSubject.upsert({
      where: {
        teacherId_subjectId: {
          teacherId: teacher.id,
          subjectId: physicsSubject.id
        }
      },
      update: {},
      create: {
        teacherId: teacher.id,
        subjectId: physicsSubject.id
      }
    })
  }

  // 关联学生和科目
  console.log('🔗 Linking student to subjects...')
  if (mathSubject && physicsSubject) {
    await prisma.studentSubject.upsert({
      where: {
        studentId_subjectId: {
          studentId: student.id,
          subjectId: mathSubject.id
        }
      },
      update: {},
      create: {
        studentId: student.id,
        subjectId: mathSubject.id
      }
    })

    await prisma.studentSubject.upsert({
      where: {
        studentId_subjectId: {
          studentId: student.id,
          subjectId: physicsSubject.id
        }
      },
      update: {},
      create: {
        studentId: student.id,
        subjectId: physicsSubject.id
      }
    })
  }

  console.log('✅ Subject associations created')

  // 创建教师可用时间
  console.log('⏰ Creating teacher availability...')
  const availabilityData = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, // 周一上午
    { dayOfWeek: 2, startTime: '14:00', endTime: '17:00' }, // 周二下午
  ]

  for (const avail of availabilityData) {
    await prisma.teacherAvailability.create({
      data: {
        teacherId: teacher.id,
        ...avail,
        isActive: true
      }
    })
  }

  console.log('✅ Teacher availability created')

  console.log('🎉 Database seeding completed successfully!')
  console.log('\n📊 Test data summary:')
  console.log(`- Users: ${await prisma.user.count()}`)
  console.log(`- Subjects: ${await prisma.subject.count()}`)
  console.log(`- Teacher availability slots: ${await prisma.teacherAvailability.count()}`)
  console.log('\n🔑 Test credentials:')
  console.log('Student: student@test.com / Password123')
  console.log('Teacher: teacher@test.com / Password123')
  console.log('Admin: admin@edu.com / admin123')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
