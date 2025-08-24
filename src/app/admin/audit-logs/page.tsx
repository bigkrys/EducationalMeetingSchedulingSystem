'use client'


import { useState, useEffect } from 'react'
import { 
  Card, 
  Button, 
  Input, 
  Tag, 
  Typography, 
  Space, 
  Row, 
  Col, 
  Spin,
  Table,
  Select,
  DatePicker,
  Statistic
} from 'antd'
import { 
  FileTextOutlined, 
  SearchOutlined, 
  FilterOutlined,
  DownloadOutlined,
  CalendarOutlined
} from '@ant-design/icons'

const { Option } = Select

const { Title, Text } = Typography
const { Search } = Input
const { RangePicker } = DatePicker

interface AuditLog {
  id: string
  actor: string
  action: string
  target: string
  details: string
  ipAddress: string
  userAgent: string
  timestamp: string
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)

  useEffect(() => {
    fetchAuditLogs()
  }, [])

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch('/api/admin/audit-logs')
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.target.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAction = !actionFilter || log.action === actionFilter
    const matchesDate = !dateRange || (
      log.timestamp >= dateRange[0] && log.timestamp <= dateRange[1]
    )
    return matchesSearch && matchesAction && matchesDate
  })

  const getActionTag = (action: string) => {
    const colorMap: { [key: string]: string } = {
      'WAITLIST_ADDED': 'blue',
      'APPOINTMENT_CREATED': 'green',
      'APPOINTMENT_APPROVED': 'green',
      'APPOINTMENT_REJECTED': 'red',
      'APPOINTMENT_CANCELLED': 'orange',
      'APPOINTMENT_EXPIRED': 'default',
      'USER_LOGIN': 'purple',
      'USER_REGISTERED': 'cyan'
    }
    
    const textMap: { [key: string]: string } = {
      'WAITLIST_ADDED': '候补队列添加',
      'APPOINTMENT_CREATED': '预约创建',
      'APPOINTMENT_APPROVED': '预约批准',
      'APPOINTMENT_REJECTED': '预约拒绝',
      'APPOINTMENT_CANCELLED': '预约取消',
      'APPOINTMENT_EXPIRED': '预约过期',
      'USER_LOGIN': '用户登录',
      'USER_REGISTERED': '用户注册'
    }
    
    return (
      <Tag color={colorMap[action] || 'default'}>
        {textMap[action] || action}
      </Tag>
    )
  }

  const exportLogs = () => {
    const csvContent = [
      ['时间', '操作者', '操作', '目标', '详情', 'IP地址'],
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.actor,
        log.action,
        log.target,
        log.details,
        log.ipAddress
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: string) => new Date(timestamp).toLocaleString('zh-CN')
    },
    {
      title: '操作者',
      dataIndex: 'actor',
      key: 'actor',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      render: (action: string) => getActionTag(action)
    },
    {
      title: '目标',
      dataIndex: 'target',
      key: 'target',
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
      render: (details: string) => (
        <div style={{ maxWidth: '200px' }} title={details}>
          {details.length > 50 ? `${details.substring(0, 50)}...` : details}
        </div>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip: string) => <Text type="secondary" style={{ fontSize: '12px' }}>{ip}</Text>
    }
  ]

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
        <Title level={2}>审计日志</Title>
        <Text type="secondary">查看系统操作记录和用户活动</Text>
      </div>

      {/* 搜索和过滤 */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Search
              placeholder="搜索操作者、操作或目标"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          
          <Col xs={24} md={8}>
            <Select
              placeholder="选择操作类型"
              value={actionFilter}
              onChange={setActionFilter}
              style={{ width: '100%' }}
              allowClear
            >
              <Option value="WAITLIST_ADDED">候补队列添加</Option>
              <Option value="APPOINTMENT_CREATED">预约创建</Option>
              <Option value="APPOINTMENT_APPROVED">预约批准</Option>
              <Option value="APPOINTMENT_REJECTED">预约拒绝</Option>
              <Option value="APPOINTMENT_CANCELLED">预约取消</Option>
              <Option value="APPOINTMENT_EXPIRED">预约过期</Option>
              <Option value="USER_LOGIN">用户登录</Option>
              <Option value="USER_REGISTERED">用户注册</Option>
            </Select>
          </Col>

          <Col xs={24} md={8}>
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['开始日期', '结束日期']}
              onChange={(dates) => {
                if (dates) {
                  setDateRange([
                    dates[0]?.toISOString() || '',
                    dates[1]?.toISOString() || ''
                  ])
                } else {
                  setDateRange(null)
                }
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* 操作按钮 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Text type="secondary">总日志数: {filteredLogs.length}</Text>
        </Col>
        <Col>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={exportLogs}
          >
            导出CSV
          </Button>
        </Col>
      </Row>

      {/* 审计日志列表 */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            审计日志列表
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredLogs}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
          }}
        />
      </Card>
    </div>
  )
}
