'use client'

export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { Card, Typography, Button, Space, Switch, message, Modal, Table, Alert } from 'antd'
import { ReloadOutlined, ClockCircleOutlined, BellOutlined } from '@ant-design/icons'
import Link from 'next/link'

const { Title, Text } = Typography

export default function AdminSystemTasks() {
  const [running, setRunning] = useState<string | null>(null)
  const [forceReset, setForceReset] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('任务结果')
  const [successIds, setSuccessIds] = useState<string[] | null>(null)
  const [failedItems, setFailedItems] = useState<{ id: string; error: string }[] | null>(null)

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={2} style={{ margin: 0 }}>
            系统任务
          </Title>
          <Link href="/admin">
            <Button>返回控制台</Button>
          </Link>
        </div>

        <Card>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="提示"
            description="系统任务会对大量数据执行批量变更，请在低峰时段操作。执行完成后可在审计日志查看记录。"
          />
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Switch checked={forceReset} onChange={setForceReset} />
              <Text>强制重置月度配额（非每月1日也允许）</Text>
            </Space>
            <Space wrap>
              <Button
                loading={running === 'reset-quota'}
                icon={<ReloadOutlined />}
                onClick={async () => {
                  try {
                    setRunning('reset-quota')
                    const token = localStorage.getItem('accessToken')
                    const res = await fetch(`/api/admin/tasks/reset-quota?force=${forceReset}`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(json.message || '执行失败')
                    message.success(`配额重置完成，更新 ${json.updated || 0} 人`)
                    setModalTitle('配额重置结果')
                    setSuccessIds(json.updatedIds || [])
                    setFailedItems(null)
                    setModalOpen(true)
                  } catch (e) {
                    message.error((e as Error).message)
                  } finally {
                    setRunning(null)
                  }
                }}
              >
                重置月度配额
              </Button>

              <Button
                loading={running === 'expire-pending'}
                icon={<ClockCircleOutlined />}
                onClick={async () => {
                  try {
                    setRunning('expire-pending')
                    const token = localStorage.getItem('accessToken')
                    const res = await fetch('/api/admin/tasks/expire-pending', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(json.message || '执行失败')
                    message.success(`已过期标记完成，数量 ${json.updated || 0}`)
                    setModalTitle('过期处理结果')
                    setSuccessIds(json.expiredIds || [])
                    setFailedItems(null)
                    setModalOpen(true)
                  } catch (e) {
                    message.error((e as Error).message)
                  } finally {
                    setRunning(null)
                  }
                }}
              >
                过期未审批预约
              </Button>

              <Button
                loading={running === 'remind-24'}
                icon={<BellOutlined />}
                onClick={async () => {
                  try {
                    setRunning('remind-24')
                    const token = localStorage.getItem('accessToken')
                    const res = await fetch('/api/admin/tasks/remind', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ offsetHours: 24 }),
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(json.message || '执行失败')
                    message.success(
                      `24小时提醒发送：成功 ${json.sent || 0}，失败 ${json.failed || 0}`
                    )
                    setModalTitle('24小时提醒结果')
                    setSuccessIds(json.results?.successfulIds || [])
                    setFailedItems(json.results?.failed || [])
                    setModalOpen(true)
                  } catch (e) {
                    message.error((e as Error).message)
                  } finally {
                    setRunning(null)
                  }
                }}
              >
                发送24小时提醒
              </Button>

              <Button
                loading={running === 'remind-1'}
                icon={<BellOutlined />}
                onClick={async () => {
                  try {
                    setRunning('remind-1')
                    const token = localStorage.getItem('accessToken')
                    const res = await fetch('/api/admin/tasks/remind', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ offsetHours: 1 }),
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(json.message || '执行失败')
                    message.success(
                      `1小时提醒发送：成功 ${json.sent || 0}，失败 ${json.failed || 0}`
                    )
                    setModalTitle('1小时提醒结果')
                    setSuccessIds(json.results?.successfulIds || [])
                    setFailedItems(json.results?.failed || [])
                    setModalOpen(true)
                  } catch (e) {
                    message.error((e as Error).message)
                  } finally {
                    setRunning(null)
                  }
                }}
              >
                发送1小时提醒
              </Button>
            </Space>
          </Space>
        </Card>

        <Modal
          title={modalTitle}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={() => setModalOpen(false)}
          width={800}
        >
          {successIds && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Paragraph>成功 ID（{successIds.length}）</Typography.Paragraph>
              <Table
                size="small"
                rowKey={(r) => r}
                dataSource={successIds}
                columns={
                  [{ title: 'ID', dataIndex: 'id', render: (_: any, id: string) => id }] as any
                }
                pagination={false}
              />
            </div>
          )}
          {failedItems && failedItems.length > 0 && (
            <div>
              <Typography.Paragraph>失败（{failedItems.length}）</Typography.Paragraph>
              <Table
                size="small"
                rowKey={(r) => r.id}
                dataSource={failedItems}
                columns={[
                  { title: 'ID', dataIndex: 'id' },
                  { title: '错误', dataIndex: 'error' },
                ]}
                pagination={false}
              />
            </div>
          )}
        </Modal>
      </Space>
    </div>
  )
}
