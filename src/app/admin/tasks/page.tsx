'use client'

export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { Card, Typography, Button, Space, Switch, message, Modal, Table, Alert } from 'antd'
import { ReloadOutlined, ClockCircleOutlined, BellOutlined } from '@ant-design/icons'
import Link from 'next/link'
import { useFetch } from '@/lib/frontend/useFetch'

const { Title, Text } = Typography

export default function AdminSystemTasks() {
  const { fetchWithAuth } = useFetch()
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
                    const { res, json } = await fetchWithAuth(
                      `/api/admin/tasks/reset-quota?force=${forceReset}`,
                      {
                        method: 'POST',
                      }
                    )
                    if (!res.ok) throw new Error(json?.message || '\u6267\u884c\u5931\u8d25')
                    message.success(
                      `\u914d\u989d\u91cd\u7f6e\u5b8c\u6210\uff0c\u66f4\u65b0 ${json.updated || 0} \u4eba`
                    )
                    setModalTitle('\u914d\u989d\u91cd\u7f6e\u7ed3\u679c')
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
                    const { res, json } = await fetchWithAuth('/api/admin/tasks/expire-pending', {
                      method: 'POST',
                    })
                    if (!res.ok) throw new Error(json?.message || '\u6267\u884c\u5931\u8d25')
                    message.success(
                      `\u5df2\u8fc7\u671f\u6807\u8bb0\u5b8c\u6210\uff0c\u6570\u91cf ${json.updated || 0}`
                    )
                    setModalTitle('\u8fc7\u671f\u5904\u7406\u7ed3\u679c')
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
                    const { res, json } = await fetchWithAuth('/api/admin/tasks/remind', {
                      method: 'POST',
                      jsonBody: { offsetHours: 24 },
                    })
                    if (!res.ok) throw new Error(json?.message || '\u6267\u884c\u5931\u8d25')
                    message.success(
                      `24\u5c0f\u65f6\u63d0\u9192\u53d1\u9001:\u6210\u529f ${json.sent || 0},\u5931\u8d25 ${json.failed || 0}`
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
                    const { res, json } = await fetchWithAuth('/api/admin/tasks/remind', {
                      method: 'POST',
                      jsonBody: { offsetHours: 1 },
                    })
                    if (!res.ok) throw new Error(json?.message || '\u6267\u884c\u5931\u8d25')
                    message.success(
                      `1\u5c0f\u65f6\u63d0\u9192\u53d1\u9001:\u6210\u529f ${json.sent || 0},\u5931\u8d25 ${json.failed || 0}`
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
