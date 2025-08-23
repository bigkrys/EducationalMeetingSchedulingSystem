'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Table, Tag, Button, Space, Modal, message, Select, Empty, Alert } from 'antd'
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  UserOutlined, 
  BookOutlined,
  ClockCircleOutlined as WaitlistIcon,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { httpClient } from '@/lib/api/http-client'
import { getCurrentUserId } from '@/lib/api/auth'

const { Option } = Select

interface WaitlistEntry {
  id: string
  teacherId: string
  teacherName: string
  date: string
  slot: string
  priority: 'premium' | 'level1' | 'level2'
  status: 'waiting' | 'promoted' | 'expired'
  createdAt: string
  studentId: string
  studentName: string
}

export default function Waitlist() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [removeModalVisible, setRemoveModalVisible] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [adding, setAdding] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    fetchWaitlist()
  }, [])

  const fetchWaitlist = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const userId = getCurrentUserId()
      if (!userId) {
        message.error('请先登录')
        router.push('/')
        return
      }

      const data = await httpClient.get<{ items: WaitlistEntry[] }>(
        `/api/waitlist?studentId=${userId}`
      )
      
      setWaitlist(data.items || [])
    } catch (error: any) {
      setError(error.message || '获取候补列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAddToWaitlist = async (values: any) => {
    setAdding(true)
    try {
      await httpClient.post('/api/waitlist', {
        teacherId: values.teacherId,
        date: values.date,
        slot: values.slot,
        studentId: getCurrentUserId(),
        subject: values.subject
      })

      message.success('已加入候补队列')
      setAddModalVisible(false)
      fetchWaitlist()
    } catch (error: any) {
      message.error(error.message || '加入候补队列失败')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveFromWaitlist = (item: WaitlistEntry) => {
    setSelectedEntry(item)
    setRemoveModalVisible(true)
  }

  const confirmRemove = async () => {
    if (!selectedEntry) return

    try {
      await httpClient.delete(`/api/waitlist/${selectedEntry.id}`)
      message.success('已从候补队列中移除')
      setRemoveModalVisible(false)
      setSelectedEntry(null)
      fetchWaitlist()
    } catch (error: any) {
      message.error(error.message || '移除失败')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'blue'
      case 'promoted': return 'green'
      case 'expired': return 'red'
      default: return 'default'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return '等待中'
      case 'promoted': return '已提升'
      case 'expired': return '已过期'
      default: return status
    }
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'premium': return '高优先级'
      case 'level1': return '中优先级'
      case 'level2': return '低优先级'
      default: return '未知优先级'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'premium': return 'red'
      case 'level1': return 'orange'
      case 'level2': return 'blue'
      default: return 'default'
    }
  }

  const columns = [
    {
      title: '科目',
      dataIndex: 'subject',
      key: 'subject',
      render: (subject: string) => (
        <span className="font-medium">{subject}</span>
      )
    },
    {
      title: '教师',
      dataIndex: 'teacherName',
      key: 'teacherName',
      render: (name: string) => (
        <div className="flex items-center space-x-2">
          <UserOutlined className="text-blue-600" />
          <span>{name}</span>
        </div>
      )
    },
    {
      title: '时间',
      dataIndex: 'slot',
      key: 'slot',
      render: (slot: string, record: WaitlistEntry) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <ClockCircleOutlined className="text-green-600" />
            <span>{format(parseISO(record.date), 'yyyy年MM月dd日')}</span>
          </div>
          <div className="flex items-center space-x-2">
            <ClockCircleOutlined className="text-blue-600" />
            <span>{format(parseISO(slot), 'HH:mm')}</span>
          </div>
        </div>
      )
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => (
        <Tag color={getPriorityColor(priority)}>
          {getPriorityText(priority)}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      )
    },
    {
      title: '加入时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => (
        <span className="text-sm text-gray-600">
          {format(parseISO(createdAt), 'MM-dd HH:mm')}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: WaitlistEntry) => (
        <Space>
          {record.status === 'waiting' && (
            <Button
              type="text"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => handleRemoveFromWaitlist(record)}
              size="small"
            >
              移除
            </Button>
          )}
        </Space>
      )
    }
  ]

  const filteredItems = filterStatus === 'all' 
    ? waitlist 
    : waitlist.filter(item => item.status === filterStatus)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面头部 */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => router.back()}
              className="flex items-center"
            >
              返回
            </Button>
            <div className="flex items-center space-x-2">
              <BookOutlined className="text-blue-600 text-xl" />
              <h1 className="text-2xl font-bold text-gray-900">候补队列</h1>
            </div>
          </div>

          {/* 说明信息 */}
          <Card className="bg-blue-50 border-blue-200">
            <div className="text-blue-800">
              <h3 className="font-medium mb-2 flex items-center">
                候补队列说明
              </h3>
              <ul className="text-sm space-y-1">
                <li>• 当热门时间段被占满时，您可以加入候补队列</li>
                <li>• 系统会根据服务级别和加入时间自动排序优先级</li>
                <li>• 当有学生取消预约时，系统会自动通知候补队列中的学生</li>
                <li>• 候补通知有效期为30分钟，请及时确认</li>
              </ul>
            </div>
          </Card>
        </div>

        {/* 统计信息 */}
        <Card className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {waitlist.filter(item => item.status === 'waiting').length}
              </div>
              <div className="text-sm text-gray-600">等待中</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {waitlist.filter(item => item.status === 'promoted').length}
              </div>
              <div className="text-sm text-gray-600">已提升</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {waitlist.filter(item => item.status === 'expired').length}
              </div>
              <div className="text-sm text-gray-600">已过期</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {waitlist.length}
              </div>
              <div className="text-sm text-gray-600">总计</div>
            </div>
          </div>
        </Card>

        {/* 主要内容 */}
        <Card>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900">候补列表</h2>
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 120 }}
                size="small"
              >
                <Option value="all">全部状态</Option>
                <Option value="waiting">等待中</Option>
                <Option value="promoted">已提升</Option>
                <Option value="expired">已过期</Option>
              </Select>
            </div>
            
            <Space>
              <Button 
                type="primary"
                icon={<WaitlistIcon />} 
                onClick={() => setAddModalVisible(true)}
              >
                加入候补
              </Button>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={fetchWaitlist}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>

          {/* 错误信息 */}
          {error && (
            <Alert
              message="错误"
              description={error}
              type="error"
              showIcon
              className="mb-4"
            />
          )}

          {/* 候补列表 */}
          {filteredItems.length === 0 ? (
            <Empty
              description="暂无候补记录"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Table
              columns={columns}
              dataSource={filteredItems}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
              }}
            />
          )}
        </Card>

        {/* 加入候补弹窗 */}
        <Modal
          title="加入候补队列"
          open={addModalVisible}
          onCancel={() => setAddModalVisible(false)}
          footer={null}
          width={600}
        >
          <div className="space-y-4">
            <Alert
              message="候补说明"
              description="加入候补队列后，当有学生取消预约时，系统会按优先级自动通知您。请确保您的联系方式畅通。"
              type="info"
              showIcon
            />
            
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                此功能正在开发中，敬请期待...
              </p>
              <Button onClick={() => setAddModalVisible(false)}>
                关闭
              </Button>
            </div>
          </div>
        </Modal>

        {/* 移除候补弹窗 */}
        <Modal
          title="移除候补"
          open={removeModalVisible}
          onCancel={() => setRemoveModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setRemoveModalVisible(false)}>
              取消
            </Button>,
            <Button 
              key="confirm" 
              type="primary" 
              danger 
              onClick={confirmRemove}
            >
              确认移除
            </Button>
          ]}
        >
          {selectedEntry && (
            <Alert
              message="确认移除"
              description={`确定要从候补队列中移除候补吗？`}
              type="warning"
              showIcon
            />
          )}
        </Modal>
      </div>
    </div>
  )
}
