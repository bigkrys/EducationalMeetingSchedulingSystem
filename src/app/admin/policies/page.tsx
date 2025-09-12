'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Form,
  InputNumber,
  Switch,
  Input,
  message,
  Spin,
  Row,
  Col,
  Divider,
} from 'antd'
import Link from 'next/link'
import { useFetch } from '@/lib/frontend/useFetch'

const { Title, Text } = Typography

type Level = 'level1' | 'level2' | 'premium'

interface Policy {
  level: Level
  monthlyAutoApprove: number
  priority: boolean
  expireHours: number
  reminderOffsets: string
  updatedAt?: string
}

export default function PoliciesPage() {
  const { fetchWithAuth } = useFetch()
  const [loading, setLoading] = useState(true)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [form] = Form.useForm()
  const fetchPolicies = async () => {
    try {
      const { res, json } = await fetchWithAuth('/api/policies')
      if (!res.ok) throw new Error('\u52a0\u8f7d\u7b56\u7565\u5931\u8d25')
      const list: Policy[] = json.policies || []
      setPolicies(list)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPolicies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 将策略数据映射到表单值（避免 Card loading 阻止 Form 挂载导致的 useForm 警告）
  useEffect(() => {
    if (!policies || policies.length === 0) return
    const initial: any = {}
    policies.forEach((p) => {
      initial[`${p.level}.monthlyAutoApprove`] = p.monthlyAutoApprove
      initial[`${p.level}.priority`] = p.priority
      initial[`${p.level}.expireHours`] = p.expireHours
      initial[`${p.level}.reminderOffsets`] = p.reminderOffsets
    })
    form.setFieldsValue(initial)
  }, [policies, form])

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      // 组装提交数据
      const payload: Policy[] = (['level1', 'level2', 'premium'] as Level[]).map((lvl) => ({
        level: lvl,
        monthlyAutoApprove: Number(values[`${lvl}.monthlyAutoApprove`] ?? 0),
        priority: Boolean(values[`${lvl}.priority`] ?? false),
        expireHours: Number(values[`${lvl}.expireHours`] ?? 48),
        reminderOffsets: String(values[`${lvl}.reminderOffsets`] ?? '24,1'),
      }))

      const { res } = await fetchWithAuth('/api/policies', {
        method: 'PUT',
        jsonBody: { policies: payload },
      })
      if (!res.ok) throw new Error('\u4fdd\u5b58\u5931\u8d25')
      message.success('策略已保存')
      fetchPolicies()
    } catch (e) {
      if (e instanceof Error) message.error(e.message)
    }
  }

  const PolicyCard = ({ level, title }: { level: Level; title: string }) => (
    <Card title={title} hoverable>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Form.Item
          name={`${level}.monthlyAutoApprove`}
          label="每月自动审批上限(次)"
          rules={[{ required: true, message: '请输入自动审批次数' }]}
        >
          <InputNumber min={0} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item name={`${level}.priority`} label="是否优先排队" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          name={`${level}.expireHours`}
          label="预约过期(小时)"
          rules={[{ required: true, message: '请输入过期时长' }]}
        >
          <InputNumber min={1} style={{ width: 200 }} />
        </Form.Item>

        <Form.Item
          name={`${level}.reminderOffsets`}
          label="提醒时间(小时,逗号分隔)"
          tooltip="例如 24,1 表示预约前24小时和1小时发送提醒"
          rules={[{ required: true, message: '请输入提醒设置' }]}
        >
          <Input style={{ width: 260 }} placeholder="24,1" />
        </Form.Item>
      </Space>
    </Card>
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0 }}>
            服务策略
          </Title>
          <Link href="/admin">
            <Button>返回控制台</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center" style={{ minHeight: 240 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card>
            <Form form={form} layout="vertical">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12} lg={8}>
                  <PolicyCard level="level1" title="基础服务 (level1)" />
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <PolicyCard level="level2" title="进阶服务 (level2)" />
                </Col>
                <Col xs={24} md={12} lg={8}>
                  <PolicyCard level="premium" title="尊享服务 (premium)" />
                </Col>
              </Row>
              <Divider />
              <Space>
                <Button onClick={() => form.resetFields()}>重置</Button>
                <Button type="primary" onClick={onSave}>
                  保存
                </Button>
              </Space>
            </Form>
          </Card>
        )}
      </Space>
    </div>
  )
}
