'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, DatePicker, Input, Table, Popconfirm, Space } from 'antd'
import { showApiError, showErrorMessage, showSuccessMessage } from '@/lib/api/global-error-handler'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { getCurrentUserId } from '@/lib/api/auth'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

interface BlockedTime {
  id: string
  startTime: string
  endTime: string
  reason?: string
  createdAt: string
}

export default function BlockedTimes() {
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([])
  const [loading, setLoading] = useState(false)
  const [formVisible, setFormVisible] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    startTime: '',
    endTime: '',
    reason: '',
  })
  // 防止重复提交/删除
  const [submittingBlocked, setSubmittingBlocked] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string>('')
  const router = useRouter()

  const fetchUserInfo = useCallback(async () => {
    try {
      const userId = getCurrentUserId()
      if (!userId) {
        showErrorMessage('请先登录')
        router.push('/')
        return
      }

      const response = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (response.ok) {
        const userData = await response.json()
        if (userData.teacher && userData.teacher.id) {
          setTeacherId(userData.teacher.id)
        } else {
          showErrorMessage('用户不是教师')
          router.push('/dashboard')
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  }, [router])

  const fetchBlockedTimes = useCallback(async () => {
    if (!teacherId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/blocked-times?teacherId=${teacherId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setBlockedTimes(data.blockedTimes || [])
      }
    } catch (error) {
      showErrorMessage('获取阻塞时间失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    fetchUserInfo()
  }, [fetchUserInfo])

  useEffect(() => {
    fetchBlockedTimes()
  }, [fetchBlockedTimes])

  const handleSubmit = async () => {
    if (submittingBlocked) return
    setSubmittingBlocked(true)
    if (!formData.startTime || !formData.endTime) {
      showErrorMessage('请选择开始和结束时间')
      setSubmittingBlocked(false)
      return
    }

    try {
      const payload = {
        teacherId,
        startTime: formData.startTime,
        endTime: formData.endTime,
        reason: formData.reason,
      }

      const response = await fetch('/api/blocked-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        showSuccessMessage(editingId ? '更新成功' : '创建成功')
        setFormVisible(false)
        setEditingId(null)
        setFormData({ startTime: '', endTime: '', reason: '' })
        fetchBlockedTimes()
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
      }
    } catch (error) {
      showErrorMessage('操作失败')
    } finally {
      setSubmittingBlocked(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (deletingId) return
    setDeletingId(id)
    try {
      const response = await fetch(`/api/blocked-times?id=${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (response.ok) {
        showSuccessMessage('删除成功')
        fetchBlockedTimes()
      } else {
        const errorData = await response.json().catch(() => ({}))
        showApiError({
          code: (errorData as any)?.code ?? (errorData as any)?.error,
          message: (errorData as any)?.message,
        })
      }
    } catch (error) {
      showErrorMessage('删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (record: BlockedTime) => {
    setEditingId(record.id)
    setFormData({
      startTime: record.startTime,
      endTime: record.endTime,
      reason: record.reason || '',
    })
    setFormVisible(true)
  }

  const columns = [
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '结束时间',
      dataIndex: 'endTime',
      key: 'endTime',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string) => reason || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: BlockedTime) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个阻塞时间吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面头部 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">阻塞时间管理</h1>
          <p className="text-gray-600">设置不可用的时间段（如会议、假期等）</p>
        </div>

        {/* 添加阻塞时间 */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">添加阻塞时间</h2>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setFormVisible(!formVisible)
                if (!formVisible) {
                  setEditingId(null)
                  setFormData({ startTime: '', endTime: '', reason: '' })
                }
              }}
            >
              {formVisible ? '取消' : '添加'}
            </Button>
          </div>

          {formVisible && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">时间范围</label>
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm"
                    onChange={(dates) => {
                      if (dates && dates[0] && dates[1]) {
                        setFormData({
                          ...formData,
                          startTime: dates[0].toISOString(),
                          endTime: dates[1].toISOString(),
                        })
                      }
                    }}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    原因（可选）
                  </label>
                  <Input
                    placeholder="如：部门会议、假期等"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Button type="primary" onClick={handleSubmit}>
                  {editingId ? '更新' : '创建'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* 阻塞时间列表 */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">阻塞时间列表</h2>
          <Table
            columns={columns}
            dataSource={blockedTimes}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
            }}
          />
        </Card>
      </div>
    </div>
  )
}
