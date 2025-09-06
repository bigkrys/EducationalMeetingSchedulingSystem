import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting simplified database seeding...')

  try {
    // 1. 创建科目
    console.log('📚 Creating subjects...')
    const subjects = [
      { name: '数学', code: 'MATH', description: '数学基础与应用' },
      { name: '物理', code: 'PHYSICS', description: '物理学基础' },
      { name: '化学', code: 'CHEMISTRY', description: '化学基础' },
      { name: '生物', code: 'BIOLOGY', description: '生物学基础' },
      { name: '语文', code: 'CHINESE', description: '中文语言文学' },
      { name: '英语', code: 'ENGLISH', description: '英语语言学习' },
    ]

    const createdSubjects = []
    for (const subject of subjects) {
      const created = await prisma.subject.upsert({
        where: { code: subject.code },
        update: subject,
        create: subject,
      })
      createdSubjects.push(created)
    }
    console.log('✅ Subjects created')

    // 2. 创建学生用户
    console.log('👨‍🎓 Creating students...')
    const students = [
      {
        email: 'student-a@test.com',
        password: 'password123',
        name: '学生A',
        serviceLevel: 'level1',
        subjects: ['MATH', 'PHYSICS'],
      },
      {
        email: 'student-b@test.com',
        password: 'password123',
        name: '学生B',
        serviceLevel: 'level2',
        subjects: ['CHEMISTRY', 'BIOLOGY'],
      },
      {
        email: 'student-c@test.com',
        password: 'password123',
        name: '学生C',
        serviceLevel: 'premium',
        subjects: ['CHINESE', 'ENGLISH'],
      },
    ]

    const createdStudents = []
    for (const studentData of students) {
      // 创建用户
      const user = await prisma.user.upsert({
        where: { email: studentData.email },
        update: {
          passwordHash: await bcrypt.hash(studentData.password, 12),
          status: 'active',
        },
        create: {
          email: studentData.email,
          passwordHash: await bcrypt.hash(studentData.password, 12),
          name: studentData.name,
          role: 'student',
          status: 'active',
        },
      })

      // 创建学生档案
      const student = await prisma.student.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          serviceLevel: studentData.serviceLevel,
          monthlyMeetingsUsed: 0,
          lastQuotaReset: new Date(),
        },
      })

      // 关联科目
      const studentSubjects = createdSubjects.filter((s) => studentData.subjects.includes(s.code))

      for (const subject of studentSubjects) {
        await prisma.studentSubject.upsert({
          where: {
            studentId_subjectId: {
              studentId: student.id,
              subjectId: subject.id,
            },
          },
          update: {},
          create: {
            studentId: student.id,
            subjectId: subject.id,
          },
        })
      }

      createdStudents.push({ user, student, subjects: studentSubjects })
      console.log(`✅ Created ${studentData.name} (${studentData.serviceLevel})`)
    }

    // 3. 创建教师用户
    console.log('👨‍🏫 Creating teachers...')
    const teachers = [
      {
        email: 'teacher-a@test.com',
        password: 'password123',
        name: '教师A',
        timezone: 'Asia/Shanghai',
        subjects: ['MATH', 'PHYSICS'],
        maxDailyMeetings: 8,
        bufferMinutes: 15,
      },
      {
        email: 'teacher-b@test.com',
        password: 'password123',
        name: '教师B',
        timezone: 'America/Los_Angeles',
        subjects: ['CHEMISTRY', 'BIOLOGY'],
        maxDailyMeetings: 6,
        bufferMinutes: 20,
      },
      {
        email: 'teacher-c@test.com',
        password: 'password123',
        name: '教师C',
        timezone: 'Europe/London',
        subjects: ['CHINESE', 'ENGLISH'],
        maxDailyMeetings: 10,
        bufferMinutes: 10,
      },
    ]

    const createdTeachers = []
    for (const teacherData of teachers) {
      // 创建用户
      const user = await prisma.user.upsert({
        where: { email: teacherData.email },
        update: {
          passwordHash: await bcrypt.hash(teacherData.password, 12),
          status: 'active',
        },
        create: {
          email: teacherData.email,
          passwordHash: await bcrypt.hash(teacherData.password, 12),
          name: teacherData.name,
          role: 'teacher',
          status: 'active',
        },
      })

      // 创建教师档案
      const teacher = await prisma.teacher.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          maxDailyMeetings: teacherData.maxDailyMeetings,
          bufferMinutes: teacherData.bufferMinutes,
          // timezone set later via raw SQL for demo
        },
      })

      // 关联科目
      const teacherSubjects = createdSubjects.filter((s) => teacherData.subjects.includes(s.code))

      for (const subject of teacherSubjects) {
        await prisma.teacherSubject.upsert({
          where: {
            teacherId_subjectId: {
              teacherId: teacher.id,
              subjectId: subject.id,
            },
          },
          update: {},
          create: {
            teacherId: teacher.id,
            subjectId: subject.id,
          },
        })
      }

      createdTeachers.push({ user, teacher, subjects: teacherSubjects })
      console.log(`✅ Created ${teacherData.name} (${teacherData.maxDailyMeetings} meetings/day)`)
    }

    // 4. 创建教师可用时间
    console.log('⏰ Creating teacher availability...')
    for (const { teacher } of createdTeachers) {
      // 每个教师设置不同的可用时间
      const availabilityData = [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, // 周一上午
        { dayOfWeek: 2, startTime: '14:00', endTime: '17:00' }, // 周二下午
        { dayOfWeek: 3, startTime: '10:00', endTime: '15:00' }, // 周三全天
      ]

      for (const avail of availabilityData) {
        await prisma.teacherAvailability.upsert({
          where: {
            id: `${teacher.id}-${avail.dayOfWeek}`,
          },
          update: {},
          create: {
            id: `${teacher.id}-${avail.dayOfWeek}`,
            teacherId: teacher.id,
            ...avail,
          },
        })
      }
    }
    console.log('✅ Teacher availability created')

    // 4.1 使用原始 SQL 设置教师的时区，避免 Prisma 类型缓存问题
    console.log('🌍 Updating teacher timezones...')
    await prisma.$executeRawUnsafe(`
      UPDATE "teachers" t
      SET "timezone" = 'Asia/Shanghai'
      FROM "users" u
      WHERE t."userId" = u."id" AND u."email" = 'teacher-a@test.com';
    `)
    await prisma.$executeRawUnsafe(`
      UPDATE "teachers" t
      SET "timezone" = 'America/Los_Angeles'
      FROM "users" u
      WHERE t."userId" = u."id" AND u."email" = 'teacher-b@test.com';
    `)
    await prisma.$executeRawUnsafe(`
      UPDATE "teachers" t
      SET "timezone" = 'Europe/London'
      FROM "users" u
      WHERE t."userId" = u."id" AND u."email" = 'teacher-c@test.com';
    `)
    console.log('✅ Teacher timezones updated')

    // 5. 创建管理员用户
    console.log('👑 Creating admin user...')
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@test.com' },
      update: {
        passwordHash: await bcrypt.hash('admin123', 12),
        status: 'active',
      },
      create: {
        email: 'admin@test.com',
        passwordHash: await bcrypt.hash('admin123', 12),
        name: '系统管理员',
        role: 'admin',
        status: 'active',
      },
    })

    // Admin用户已创建，无需额外的admin表
    console.log('✅ Admin user created')

    // 6. 输出测试账户信息
    console.log('\n🎉 Database seeding completed successfully!')
    console.log('\n📊 Test accounts summary:')
    console.log('\n👨‍🎓 Students:')
    students.forEach((student, index) => {
      console.log(`${index + 1}. ${student.name} (${student.email})`)
      console.log(`   Password: ${student.password}`)
      console.log(`   Service Level: ${student.serviceLevel}`)
      console.log(`   Subjects: ${student.subjects.join(', ')}`)
    })

    console.log('\n👨‍🏫 Teachers:')
    teachers.forEach((teacher, index) => {
      console.log(`${index + 1}. ${teacher.name} (${teacher.email})`)
      console.log(`   Password: ${teacher.password}`)
      console.log(`   Subjects: ${teacher.subjects.join(', ')}`)
      console.log(`   Max Daily: ${teacher.maxDailyMeetings}`)
      console.log(`   Timezone: ${teacher.timezone}`)
    })

    console.log('\n👑 Admin:')
    console.log(`- 系统管理员 (admin@test.com)`)
    console.log(`- Password: admin123`)

    console.log('\n🔗 Subject Coverage:')
    console.log('- 数学/物理: 学生A + 教师A')
    console.log('- 化学/生物: 学生B + 教师B')
    console.log('- 语文/英语: 学生C + 教师C')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
