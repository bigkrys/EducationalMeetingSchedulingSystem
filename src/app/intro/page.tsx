'use client'

import Link from 'next/link'
import { Button, Typography } from 'antd'
import {
  CalendarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  BellOutlined,
  SafetyCertificateOutlined,
  LineChartOutlined,
} from '@ant-design/icons'

const { Title, Paragraph } = Typography

export default function IntroPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/60 border-b border-black/5">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-tight">Educational Meeting Scheduling System</div>
          <nav className="flex items-center gap-3">
            <Link href="/">
              <Button>登录 / 开始使用</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-48 right-0 h-96 w-96 rounded-full bg-gradient-to-br from-indigo-200 to-blue-200 blur-3xl opacity-60" />
          <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-gradient-to-tr from-purple-200 to-pink-200 blur-3xl opacity-60" />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28 text-center">
          <Title level={1} className="!font-black !mb-3 !text-5xl md:!text-7xl !leading-tight">
            教育预约系统
          </Title>
          <Title level={2} className="!font-black !mb-3 !text-2xl md:!text-2xl !leading-tight">
            预约与调度，优雅完成
          </Title>
          <Paragraph className="!text-lg md:!text-xl !text-gray-600 !leading-relaxed !max-w-3xl !mx-auto">
            面向院校的教师-学生预约平台。轻松安排日程，智能提醒与候补，高效、可靠。
          </Paragraph>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/">
              <Button type="primary" size="large">
                开始使用
              </Button>
            </Link>
            <Link href="#features">
              <Button size="large">了解特性</Button>
            </Link>
          </div>

          {/* Product spotlight card */}
          <div className="mt-14 mx-auto max-w-5xl">
            <div className="relative rounded-3xl bg-gradient-to-br from-gray-50 to-white shadow-[0_10px_60px_rgba(0,0,0,0.08)] ring-1 ring-black/5 p-6 md:p-10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="text-left">
                  <h3 className="text-2xl md:text-3xl font-bold mb-2">一站式校园预约</h3>
                  <p className="text-gray-600 leading-relaxed">
                    学生查询可用时段、创建/改期/取消预约；教师维护可用性与阻塞时间；按服务级别配额与审批策略智能调度。
                  </p>
                </div>
                {/* Mock UI preview */}
                <div className="relative">
                  <div className="absolute -top-8 -left-6 h-24 w-24 bg-indigo-200/40 rounded-2xl blur-xl" />
                  <div className="absolute -bottom-8 -right-6 h-24 w-24 bg-blue-200/40 rounded-2xl blur-xl" />
                  <div className="rounded-2xl bg-white ring-1 ring-black/10 shadow-lg p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-6 w-24 rounded-full bg-gray-100" />
                      <div className="h-6 w-20 rounded-full bg-gray-100" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="rounded-xl p-4 ring-1 ring-black/10 shadow-sm bg-gradient-to-br from-indigo-50 to-white"
                        >
                          <div className="h-4 w-16 bg-indigo-100 rounded mb-2" />
                          <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
                          <div className="h-8 w-full bg-indigo-500/90 rounded text-white text-center text-sm flex items-center justify-center">
                            预约
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: CalendarOutlined,
                title: '学生预约',
                desc: '查询可用槽位，创建/取消/改期，掌握全部安排。',
              },
              {
                icon: TeamOutlined,
                title: '教师管理',
                desc: '每周可用时段与阻塞时间，审批待处理预约。',
              },
              {
                icon: SafetyCertificateOutlined,
                title: '服务级别',
                desc: 'L1/L2/Premium 配额与审批策略，月初自动重置。',
              },
              {
                icon: ThunderboltOutlined,
                title: '候补队列',
                desc: '热门时段候补，空出后自动顶替并提醒通知。',
              },
              {
                icon: BellOutlined,
                title: '提醒与超时',
                desc: 'T-24h/T-1h 提醒，超时自动过期与清理。',
              },
              {
                icon: LineChartOutlined,
                title: '可观测性',
                desc: 'Sentry 集成、全局错误处理与健康检查路由。',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl ring-1 ring-black/5 shadow-sm p-6 hover:shadow-md transition-shadow bg-white"
              >
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                  <Icon />
                </div>
                <h4 className="text-lg font-semibold mb-1">{title}</h4>
                <p className="text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reliability */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h3 className="text-3xl font-bold mb-4">可靠、安全、可观测</h3>
          <p className="text-white/70 max-w-3xl">
            内置任务中心重置配额、过期审批与候补清理；安全策略保护作业路由；Sentry
            贯穿前后端，助你从容定位问题。
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 text-center">
          <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            现在，就开始更好的预约
          </h3>
          <div className="flex items-center justify-center gap-3">
            <Link href="/">
              <Button type="primary" size="large">
                开始使用
              </Button>
            </Link>
            <Link href="/intro">
              <Button size="large">了解更多</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
