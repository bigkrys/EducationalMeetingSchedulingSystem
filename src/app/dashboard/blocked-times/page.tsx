'use client'

import { useState, useEffect } from 'react'
import { Card, Button, DatePicker, Input, message, Table, Popconfirm, Space } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { getCurrentUserId } from '@/lib/api/auth'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { TextArea } = Input

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
    reason: ''
  })
  const [teacherId, setTeacherId] = useState<string>('')
  const router = useRouter()

  useEffect(() => {
    fetchUserInfo()
    fetchBlockedTimes()
  }, [])

  const fetchUserInfo = async () => {
    try {
      const userId = getCurrentUserId()
      if (!userId) {
        message.error('请先登录')
        router.push('/')
        return
      }

      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      })

      if (response.ok) {
        const userData = await response.json()
        if (userData.teacher && userData.teacher.id) {
          setTeacherId(userData.teacher.id)
        } else {
          message.error('用户不是教师')
          router.push('/dashboard')
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  }

  const fetchBlockedTimes = async () => {
    if (!teacherId) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/blocked-times?teacherId=${teacherId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setBlockedTimes(data.blockedTimes || [])
      }
    } catch (error) {
      console.error('获取阻塞时间失败:', error)
      message.error('获取阻塞时间失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!formData.startTime || !formData.endTime) {
      message.error('请选择开始和结束时间')
      return
    }

    try {
      const payload = {
        teacherId,
        startTime: formData.startTime,
        endTime: formData.endTime,
        reason: formData.reason
      }

      const response = await fetch('/api/blocked-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        message.success(editingId ? '更新成功' : '创建成功')
        setFormVisible(false)
        setEditingId(null)
        setFormData({ startTime: '', endTime: '', reason: '' })
        fetchBlockedTimes()
      } else {
        const errorData = await response.json()
        message.error(errorData.message || '操作失败')
      }
    } catch (error) {
      console.error('操作失败:', error)
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/blocked-times?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      })

      if (response.ok) {
        message.success('删除成功')
        fetchBlockedTimes()
      } else {
        message.error('删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      message.error('删除失败')
    }
  }

  const handleEdit = (record: BlockedTime) => {
    setEditingId(record.id)
    setFormData({
      startTime: record.startTime,
      endTime: record.endTime,
      reason: record.reason || ''
    })
    setFormVisible(true)
  }

  const columns = [
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '结束时间',
      dataIndex: 'endTime',
      key: 'endTime',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string) => reason || '-'
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: BlockedTime) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
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
      )
    }
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    时间范围
                  </label>
                  <RangePicker
                    showTime
                    format="YYYY-MM-DD HH:mm"
                    onChange={(dates) => {
                      if (dates && dates[0] && dates[1]) {
                        setFormData({
                          ...formData,
                          startTime: dates[0].toISOString(),
                          endTime: dates[1].toISOString()
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
              showQuickJumper: true
            }}
          />
        </Card>
      </div>
    </div>
  )
}
