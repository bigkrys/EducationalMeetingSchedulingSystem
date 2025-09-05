'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Table, Tag, Button, Space, Modal, Select, Empty, Alert, Input } from 'antd'
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  UserOutlined, 
  BookOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { httpClient } from '@/lib/api/http-client'
import { showApiError, showErrorMessage, showSuccessMessage } from '@/lib/api/global-error-handler'
import { getCurrentUserId, getCurrentUserRole } from '@/lib/api/auth'
import AuthGuard from '@/components/shared/AuthGuard'
import PageLoader from '@/components/shared/PageLoader'

const { Option } = Select
const { TextArea } = Input

interface Appointment {
  id: string
  subject: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  scheduledTime: string
  durationMinutes: number
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'no_show' | 'expired'
  createdAt: string
  notes?: string
  reason?: string
}

export default function AppointmentsManagement() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [approveModalVisible, setApproveModalVisible] = useState(false)
  const [rejectModalVisible, setRejectModalVisible] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)
  
  const router = useRouter()

  const currentUserRole = getCurrentUserRole()
  const isTeacher = currentUserRole === 'teacher'

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const userId = getCurrentUserId()
      if (!userId) {
        router.push('/')
        return
      }

      const endpoint = isTeacher 
        ? `/api/appointments?role=teacher&teacherId=${userId}`
        : `/api/appointments?role=admin`
      
      const response = await httpClient.get(endpoint)
      const data = await response.json()
      setAppointments(data.items || [])
    } catch (error: any) {
      setError(error.message || '获取预约列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (appointment: Appointment) => {
  if (processing) return
  setSelectedAppointment(appointment)
  setApproveModalVisible(true)
  }

  const confirmApprove = async () => {
    if (!selectedAppointment) return

    setProcessing(true)
    try {
      await httpClient.patch(`/api/appointments/${selectedAppointment.id}`, {
        action: 'approve'
      })

      showSuccessMessage('预约已确认')
      setApproveModalVisible(false)
      setSelectedAppointment(null)
      fetchAppointments()
    } catch (error: any) {
      showApiError({ message: error?.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async (appointment: Appointment) => {
  if (processing) return
  setSelectedAppointment(appointment)
  setRejectModalVisible(true)
  setRejectReason('')
  }

  const confirmReject = async () => {
    if (!selectedAppointment || !rejectReason.trim()) {
      showErrorMessage('请输入拒绝原因')
      return
    }

    setProcessing(true)
    try {
      await httpClient.patch(`/api/appointments/${selectedAppointment.id}`, {
        action: 'cancel',
        reason: rejectReason.trim()
      })

      showSuccessMessage('预约已拒绝')
      setRejectModalVisible(false)
      setSelectedAppointment(null)
      setRejectReason('')
      fetchAppointments()
    } catch (error: any) {
      showApiError({ message: error?.message })
    } finally {
      setProcessing(false)
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
      title: isTeacher ? '学生' : '学生/教师',
      key: 'participants',
      render: (_: any, record: Appointment) => (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <UserOutlined className="text-blue-600" />
            <span className="text-sm">
              学生：{record.studentName}
            </span>
          </div>
          {!isTeacher && (
            <div className="flex items-center space-x-2">
              <UserOutlined className="text-green-600" />
              <span className="text-sm">
                教师：{record.teacherName}
              </span>
            </div>
          )}
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
            <span className="text-sm">
              {format(parseISO(scheduledTime), 'yyyy年MM月dd日')}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <ClockCircleOutlined className="text-blue-600" />
            <span className="text-sm">
              {format(parseISO(scheduledTime), 'HH:mm')}
            </span>
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
          <span className="text-gray-600 text-sm max-w-xs truncate block" title={notes}>
            {notes}
          </span>
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
          {record.status === 'pending' && isTeacher && (
            <>
              <Button
                type="text"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(record)}
                size="small"
                className="text-green-600"
              >
                确认
              </Button>
              <Button
                type="text"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleReject(record)}
                size="small"
              >
                拒绝
              </Button>
            </>
          )}
        </Space>
      )
    }
  ]

  // 过滤和搜索
  const filteredAppointments = appointments
    .filter(app => filterStatus === 'all' || app.status === filterStatus)
    .filter(app => 
      searchText === '' || 
      app.subject.toLowerCase().includes(searchText.toLowerCase()) ||
      app.studentName.toLowerCase().includes(searchText.toLowerCase()) ||
      app.teacherName.toLowerCase().includes(searchText.toLowerCase())
    )

  if (loading) {
    return (
      <PageLoader 
        message="正在加载预约数据" 
        description="正在获取预约列表和状态信息"
      />
    )
  }

  return (
    <AuthGuard>
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
              <h1 className="text-2xl font-bold text-gray-900">
                {isTeacher ? '我的预约管理' : '预约管理'}
              </h1>
            </div>
          </div>
        </div>

        {/* 统计信息 */}
        <Card className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
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
              <div className="text-2xl font-bold text-red-600">
                {appointments.filter(a => a.status === 'cancelled').length}
              </div>
              <div className="text-sm text-gray-600">已取消</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {appointments.filter(a => a.status === 'no_show').length}
              </div>
              <div className="text-sm text-gray-600">未出席</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {appointments.filter(a => a.status === 'expired').length}
              </div>
              <div className="text-sm text-gray-600">已过期</div>
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
            
            <Space>
              <Input
                placeholder="搜索科目、学生或教师"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 200 }}
                size="small"
              />
              <Button 
                icon={<ReloadOutlined />} 
                onClick={fetchAppointments}
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

        {/* 确认预约弹窗 */}
        <Modal
          title="确认预约"
          open={approveModalVisible}
          onCancel={() => setApproveModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setApproveModalVisible(false)}>
              取消
            </Button>,
            <Button 
              key="confirm" 
              type="primary" 
              loading={processing}
              onClick={confirmApprove}
            >
              确认预约
            </Button>
          ]}
        >
          {selectedAppointment && (
            <Alert
              message="确认预约"
              description={`确定要确认学生 ${selectedAppointment.studentName} 的 ${selectedAppointment.subject} 课程预约吗？`}
              type="info"
              showIcon
            />
          )}
        </Modal>

        {/* 拒绝预约弹窗 */}
        <Modal
          title="拒绝预约"
          open={rejectModalVisible}
          onCancel={() => setRejectModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setRejectModalVisible(false)}>
              取消
            </Button>,
            <Button 
              key="confirm" 
              type="primary" 
              danger
              loading={processing}
              onClick={confirmReject}
            >
              确认拒绝
            </Button>
          ]}
        >
          {selectedAppointment && (
            <div className="space-y-4">
              <Alert
                message="拒绝预约"
                description={`确定要拒绝学生 ${selectedAppointment.studentName} 的 ${selectedAppointment.subject} 课程预约吗？`}
                type="warning"
                showIcon
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  拒绝原因 *
                </label>
                <Select
                  value={rejectReason}
                  onChange={setRejectReason}
                  placeholder="请选择拒绝原因"
                  style={{ width: '100%' }}
                >
                  <Option value="时间冲突">时间冲突</Option>
                  <Option value="课程已满">课程已满</Option>
                  <Option value="科目不匹配">科目不匹配</Option>
                  <Option value="其他">其他</Option>
                </Select>
              </div>
            </div>
          )}
        </Modal>
      </div>
      </div>
    </AuthGuard>
  )
}
