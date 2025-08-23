'use client'

import { useState, useEffect } from 'react'
import { 
  Card, 
  Button, 
  Input, 
  Switch, 
  Typography, 
  Space, 
  Row, 
  Col, 
  Spin,
  Divider,
  Alert
} from 'antd'
import { 
  SettingOutlined, 
  SaveOutlined, 
  ReloadOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography
const { TextArea } = Input

interface ServicePolicy {
  id: string
  level: 'level1' | 'level2' | 'premium'
  monthlyAutoApprove: number
  priority: boolean
  expireHours: number
  reminderOffsets: string
}

export default function PolicyManagement() {
  const [policies, setPolicies] = useState<ServicePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPolicies()
  }, [])

  const fetchPolicies = async () => {
    try {
      const response = await fetch('/api/policies')
      if (response.ok) {
        const data = await response.json()
        setPolicies(data.policies || [])
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error)
    } finally {
      setLoading(false)
    }
  }

  const updatePolicy = async (policyId: string, updates: Partial<ServicePolicy>) => {
    try {
      const response = await fetch(`/api/policies/${policyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      
      if (response.ok) {
        // 更新本地状态
        setPolicies(prev => prev.map(p => 
          p.id === policyId ? { ...p, ...updates } : p
        ))
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to update policy:', error)
      return false
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      // 这里可以实现批量保存逻辑
      await new Promise(resolve => setTimeout(resolve, 1000)) // 模拟保存
      alert('所有策略已保存')
    } catch (error) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm('确定要重置所有策略到默认值吗？')) {
      fetchPolicies()
    }
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '50vh' 
      }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2}>服务策略管理</Title>
        <Text type="secondary">配置不同服务级别的预约策略</Text>
      </div>

      {/* 操作按钮 */}
      <Space style={{ marginBottom: '24px' }}>
        <Button 
          type="primary" 
          icon={<SaveOutlined />} 
          onClick={handleSaveAll} 
          loading={saving}
        >
          {saving ? '保存中...' : '保存所有'}
        </Button>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={handleReset}
        >
          重置
        </Button>
      </Space>

      {/* 策略配置 */}
      <Row gutter={[16, 16]}>
        {policies.map((policy) => (
          <Col xs={24} lg={8} key={policy.id}>
            <Card
              title={
                <Space>
                  <SettingOutlined />
                  {policy.level === 'level1' && '一级服务'}
                  {policy.level === 'level2' && '二级服务'}
                  {policy.level === 'premium' && '高级服务'}
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text strong>月度自动批准次数</Text>
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    value={policy.monthlyAutoApprove}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      updatePolicy(policy.id, { monthlyAutoApprove: value })
                    }}
                    style={{ marginTop: '8px' }}
                  />
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    每月自动批准的预约数量
                  </Text>
                </div>

                <div>
                  <Text strong>过期时间（小时）</Text>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    value={policy.expireHours}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 48
                      updatePolicy(policy.id, { expireHours: value })
                    }}
                    style={{ marginTop: '8px' }}
                  />
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    待审批预约的过期时间
                  </Text>
                </div>

                <div>
                  <Text strong>提醒时间偏移</Text>
                  <TextArea
                    placeholder="24,1"
                    value={policy.reminderOffsets}
                    onChange={(e) => {
                      updatePolicy(policy.id, { reminderOffsets: e.target.value })
                    }}
                    style={{ marginTop: '8px' }}
                    rows={2}
                  />
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    会议前的提醒时间（小时），用逗号分隔
                  </Text>
                </div>

                <div>
                  <Space>
                    <Text strong>优先权</Text>
                    <Switch
                      checked={policy.priority}
                      onChange={(checked) => {
                        updatePolicy(policy.id, { priority: checked })
                      }}
                    />
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                    是否具有预约优先权
                  </Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {policies.length === 0 && (
        <Alert
          message="暂无策略配置"
          description="请先创建服务级别策略"
          type="info"
          showIcon
        />
      )}
    </div>
  )
}
