'use client'


import React, { useState, useEffect } from 'react'
import { 
  Card, 
  Button, 
  Form, 
  Input,
  InputNumber, 
  Switch, 
  Typography, 
  Space, 
  Row, 
  Col, 
  Spin,
  message,
  Divider,
  Tag
} from 'antd'
import { 
  SettingOutlined, 
  SaveOutlined, 
  ReloadOutlined
} from '@ant-design/icons'
import { ServicePolicy } from '@/lib/types'

const { Title, Text } = Typography

interface PolicyFormData {
  level1: {
    monthlyAutoApprove: number
    expireHours: number
    reminderOffsets: string
  }
  level2: {
    monthlyAutoApprove: number
    expireHours: number
    reminderOffsets: string
  }
  premium: {
    monthlyAutoApprove: number
    priority: boolean
    expireHours: number
    reminderOffsets: string
  }
}

export default function AdminPolicies() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policies, setPolicies] = useState<ServicePolicy[]>([])

  useEffect(() => {
    fetchPolicies()
  }, [])

  const fetchPolicies = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/policies')
      if (response.ok) {
        const data = await response.json()
        setPolicies(data.policies)
        
        // 设置表单初始值
        const formData: any = {}
        data.policies.forEach((policy: ServicePolicy) => {
          formData[policy.level] = {
            monthlyAutoApprove: policy.monthlyAutoApprove,
            priority: policy.priority,
            expireHours: policy.expireHours,
            reminderOffsets: policy.reminderOffsets
          }
        })
        form.setFieldsValue(formData)
      } else {
        message.error('获取策略配置失败')
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error)
      message.error('获取策略配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (values: PolicyFormData) => {
    try {
      setSaving(true)
      
      const policiesData = [
        {
          level: 'level1',
          monthlyAutoApprove: values.level1.monthlyAutoApprove,
          priority: false,
          expireHours: values.level1.expireHours,
          reminderOffsets: values.level1.reminderOffsets
        },
        {
          level: 'level2',
          monthlyAutoApprove: values.level2.monthlyAutoApprove,
          priority: false,
          expireHours: values.level2.expireHours,
          reminderOffsets: values.level2.reminderOffsets
        },
        {
          level: 'premium',
          monthlyAutoApprove: values.premium.monthlyAutoApprove,
          priority: values.premium.priority,
          expireHours: values.premium.expireHours,
          reminderOffsets: values.premium.reminderOffsets
        }
      ]

      const response = await fetch('/api/policies', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ policies: policiesData })
      })

      if (response.ok) {
        message.success('策略配置保存成功')
        fetchPolicies() // 重新获取最新数据
      } else {
        const error = await response.json()
        message.error(error.message || '保存失败')
      }
    } catch (error) {
      console.error('Failed to save policies:', error)
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 顶部标题 */}
      <div className="mb-8">
        <Title level={2}>
          <SettingOutlined className="mr-3" />
          服务级别策略管理
        </Title>
        <Text type="secondary">
          配置不同服务级别的预约策略和限制
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        className="max-w-4xl"
      >
        <Row gutter={[24, 24]}>
          {/* Level1 配置 */}
          <Col xs={24} lg={8}>
            <Card 
              title={
                <Space>
                  <Tag color="blue">Level 1</Tag>
                  <span>基础服务</span>
                </Space>
              }
              className="h-full"
            >
              <Form.Item
                name={['level1', 'monthlyAutoApprove']}
                label="每月自动批准次数"
                rules={[{ required: true, message: '请输入每月自动批准次数' }]}
              >
                <InputNumber 
                  min={0} 
                  max={10}
                  className="w-full"
                  placeholder="例如：2"
                />
              </Form.Item>

              <Form.Item
                name={['level1', 'expireHours']}
                label="预约过期时间（小时）"
                rules={[{ required: true, message: '请输入过期时间' }]}
              >
                <InputNumber 
                  min={1} 
                  max={168}
                  className="w-full"
                  placeholder="例如：48"
                />
              </Form.Item>

              <Form.Item
                name={['level1', 'reminderOffsets']}
                label="提醒时间偏移（小时，逗号分隔）"
                rules={[{ required: true, message: '请输入提醒时间' }]}
              >
                <Input placeholder="例如：24,1" />
              </Form.Item>

              <div className="text-sm text-gray-500 mt-4">
                <p>• 基础用户享受有限的自动批准次数</p>
                <p>• 超出次数后需要人工审批</p>
              </div>
            </Card>
          </Col>

          {/* Level2 配置 */}
          <Col xs={24} lg={8}>
            <Card 
              title={
                <Space>
                  <Tag color="orange">Level 2</Tag>
                  <span>标准服务</span>
                </Space>
              }
              className="h-full"
            >
              <Form.Item
                name={['level2', 'monthlyAutoApprove']}
                label="每月自动批准次数"
                rules={[{ required: true, message: '请输入每月自动批准次数' }]}
              >
                <InputNumber 
                  min={0} 
                  max={10}
                  className="w-full"
                  placeholder="例如：0"
                />
              </Form.Item>

              <Form.Item
                name={['level2', 'expireHours']}
                label="预约过期时间（小时）"
                rules={[{ required: true, message: '请输入过期时间' }]}
              >
                <InputNumber 
                  min={1} 
                  max={168}
                  className="w-full"
                  placeholder="例如：48"
                />
              </Form.Item>

              <Form.Item
                name={['level2', 'reminderOffsets']}
                label="提醒时间偏移（小时，逗号分隔）"
                rules={[{ required: true, message: '请输入提醒时间' }]}
              >
                <Input placeholder="例如：24,1" />
              </Form.Item>

              <div className="text-sm text-gray-500 mt-4">
                <p>• 标准用户所有预约都需要人工审批</p>
                <p>• 提供基础的提醒服务</p>
              </div>
            </Card>
          </Col>

          {/* Premium 配置 */}
          <Col xs={24} lg={8}>
            <Card 
              title={
                <Space>
                  <Tag color="gold">Premium</Tag>
                  <span>高级服务</span>
                </Space>
              }
              className="h-full"
            >
              <Form.Item
                name={['premium', 'monthlyAutoApprove']}
                label="每月自动批准次数"
                rules={[{ required: true, message: '请输入每月自动批准次数' }]}
              >
                <InputNumber 
                  min={0} 
                  max={100}
                  className="w-full"
                  placeholder="例如：999"
                />
              </Form.Item>

              <Form.Item
                name={['premium', 'priority']}
                label="优先级处理"
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>

              <Form.Item
                name={['premium', 'expireHours']}
                label="预约过期时间（小时）"
                rules={[{ required: true, message: '请输入过期时间' }]}
              >
                <InputNumber 
                  min={1} 
                  max={168}
                  className="w-full"
                  placeholder="例如：48"
                />
              </Form.Item>

              <Form.Item
                name={['premium', 'reminderOffsets']}
                label="提醒时间偏移（小时，逗号分隔）"
                rules={[{ required: true, message: '请输入提醒时间' }]}
              >
                <Input placeholder="例如：24,1" />
              </Form.Item>

              <div className="text-sm text-gray-500 mt-4">
                <p>• 高级用户享受优先处理</p>
                <p>• 无限制自动批准次数</p>
              </div>
            </Card>
          </Col>
        </Row>

        <Divider />

        {/* 操作按钮 */}
        <Row justify="center">
          <Space size="large">
            <Button 
              icon={<ReloadOutlined />}
              onClick={fetchPolicies}
              disabled={saving}
            >
              重置
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              size="large"
            >
              保存配置
            </Button>
          </Space>
        </Row>
      </Form>

      {/* 说明文档 */}
      <Card title="配置说明" className="mt-8 max-w-4xl">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Title level={5}>服务级别说明：</Title>
            <ul className="text-sm text-gray-600">
              <li><strong>Level 1（基础服务）：</strong>适合普通用户，有限的自动批准次数</li>
              <li><strong>Level 2（标准服务）：</strong>所有预约需要人工审批</li>
              <li><strong>Premium（高级服务）：</strong>享受最高优先级和无限制服务</li>
            </ul>
          </Col>
          <Col xs={24} md={12}>
            <Title level={5}>参数说明：</Title>
            <ul className="text-sm text-gray-600">
              <li><strong>自动批准次数：</strong>每月无需审批的预约数量</li>
              <li><strong>过期时间：</strong>待审批预约的超时时间</li>
              <li><strong>提醒偏移：</strong>会议前多久发送提醒（24,1表示24小时和1小时前）</li>
            </ul>
          </Col>
        </Row>
      </Card>
    </div>
  )
}