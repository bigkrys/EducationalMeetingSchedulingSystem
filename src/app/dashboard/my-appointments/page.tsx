'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Table, Tag, Button, Space, Modal, Select, Empty, Alert } from 'antd'
import { showApiError, showErrorMessage, showSuccessMessage } from '@/lib/api/global-error-handler'
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  UserOutlined, 
  BookOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { httpClient } from '@/lib/api/http-client'
import { getCurrentUserId } from '@/lib/api/auth'
import { StudentGuard } from '@/components/shared/AuthGuard'
import PageLoader from '@/components/shared/PageLoader'

const { Option } = Select

interface Appointment {
  id: string
  subject: string
  teacherId: string
  teacherName: string
  scheduledTime: string
  durationMinutes: number
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'no_show' | 'expired'
  createdAt: string
  notes?: string
}

export default function MyAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [cancelModalVisible, setCancelModalVisible] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      setError('')
      
      const userId = getCurrentUserId()
      if (!userId) {
        showErrorMessage('请先登录')
        router.push('/')
        return
      }

      const response = await httpClient.get(
        `/api/appointments?role=student&studentId=${userId}`
      )
      const data = await response.json()
      
      setAppointments(data.items || [])
    } catch (error: any) {
      setError(error.message || '获取预约列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelAppointment = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setCancelModalVisible(true)
    setCancelReason('')
  }

  const confirmCancel = async () => {
    if (!selectedAppointment || !cancelReason.trim()) {
      showErrorMessage('请输入取消原因')
      return
    }

    setCancelling(true)
    try {
      await httpClient.patch(`/api/appointments/${selectedAppointment.id}`, {
        action: 'cancel',
        reason: cancelReason.trim()
      })

      showSuccessMessage('预约取消成功')
      setCancelModalVisible(false)
      setSelectedAppointment(null)
      setCancelReason('')
      fetchAppointments() // 刷新列表
    } catch (error: any) {
      showApiError({ message: error?.message })
    } finally {
      setCancelling(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'orange'
      case 'approved': return 'green'
      case 'completed': return 'blue'
      case 'cancelled': return 'red'
      case 'no_show': return 'gray'
      case 'expired': return 'orange'
      default: return 'default'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待确认'
      case 'approved': return '已确认'
      case 'completed': return '已完成'
      case 'cancelled': return '已取消'
      case 'no_show': return '未出席'
      case 'expired': return '已过期'
      default: return status
    }
  }

  const canCancel = (status: string) => {
    return ['pending', 'approved'].includes(status)
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
      render: (teacherName: string) => (
        <div className="flex items-center space-x-2">
          <UserOutlined className="text-blue-600" />
          <span>{teacherName}</span>
        </div>
      )
    },
    {
      title: '时间',
      dataIndex: 'scheduledTime',
      key: 'scheduledTime',
      render: (scheduledTime: string) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <CalendarOutlined className="text-green-600" />
            <span>{format(parseISO(scheduledTime), 'yyyy年MM月dd日')}</span>
          </div>
          <div className="flex items-center space-x-2">
            <ClockCircleOutlined className="text-blue-600" />
            <span>{format(parseISO(scheduledTime), 'HH:mm')}</span>
          </div>
        </div>
      )
    },
    {
      title: '时长',
      dataIndex: 'durationMinutes',
      key: 'durationMinutes',
      render: (duration: number) => (
        <span>{duration} 分钟</span>
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
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes: string) => (
        notes ? (
          <span className="text-gray-600 text-sm">{notes}</span>
        ) : (
          <span className="text-gray-400 text-sm">无</span>
        )
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Appointment) => (
        <Space>
          {canCancel(record.status) && (
            <Button
              type="text"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => handleCancelAppointment(record)}
              size="small"
            >
              取消
            </Button>
          )}
        </Space>
      )
    }
  ]

  const filteredAppointments = filterStatus === 'all' 
    ? appointments 
    : appointments.filter(app => app.status === filterStatus)

  if (loading) {
    return (
      <PageLoader 
        message="正在加载预约记录" 
        description="正在获取您的所有预约信息和状态更新"
      />
    )
  }

  return (
    <StudentGuard>
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
              <h1 className="text-2xl font-bold text-gray-900">我的预约</h1>
            </div>
          </div>
        </div>

        {/* 统计信息 */}
        <Card className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {appointments.filter(a => a.status === 'pending').length}
              </div>
              <div className="text-sm text-gray-600">待确认</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {appointments.filter(a => a.status === 'approved').length}
              </div>
              <div className="text-sm text-gray-600">已确认</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {appointments.filter(a => a.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-600">已完成</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {appointments.filter(a => ['cancelled', 'no_show', 'expired'].includes(a.status)).length}
              </div>
              <div className="text-sm text-gray-600">已结束</div>
            </div>
          </div>
        </Card>

        {/* 主要内容 */}
        <Card>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900">预约列表</h2>
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 120 }}
                size="small"
              >
                <Option value="all">全部状态</Option>
                <Option value="pending">待确认</Option>
                <Option value="approved">已确认</Option>
                <Option value="completed">已完成</Option>
                <Option value="cancelled">已取消</Option>
                <Option value="no_show">未出席</Option>
                <Option value="expired">已过期</Option>
              </Select>
            </div>
            
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchAppointments}
              loading={loading}
            >
              刷新
            </Button>
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

          {/* 预约列表 */}
          {filteredAppointments.length === 0 ? (
            <Empty
              description="暂无预约记录"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Table
              columns={columns}
              dataSource={filteredAppointments}
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

        {/* 取消预约弹窗 */}
        <Modal
          title="取消预约"
          open={cancelModalVisible}
          onCancel={() => setCancelModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setCancelModalVisible(false)}>
              取消
            </Button>,
            <Button 
              key="confirm" 
              type="primary" 
              danger 
              loading={cancelling}
              onClick={confirmCancel}
            >
              确认取消
            </Button>
          ]}
        >
          {selectedAppointment && (
            <div className="space-y-4">
              <Alert
                message="确认取消预约"
                description={`确定要取消与 ${selectedAppointment.teacherName} 老师的 ${selectedAppointment.subject} 课程预约吗？`}
                type="warning"
                showIcon
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  取消原因 *
                </label>
                <Select
                  value={cancelReason}
                  onChange={setCancelReason}
                  placeholder="请选择取消原因"
                  style={{ width: '100%' }}
                >
                  <Option value="时间冲突">时间冲突</Option>
                  <Option value="个人原因">个人原因</Option>
                  <Option value="课程调整">课程调整</Option>
                  <Option value="其他">其他</Option>
                </Select>
              </div>
            </div>
          )}
        </Modal>
      </div>
      </div>
    </StudentGuard>
  )
}
