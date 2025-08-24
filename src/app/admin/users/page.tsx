'use client'

// 强制动态渲染，避免预渲染问题
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { 
  Button, 
  Input, 
  Tag, 
  Card, 
  Table, 
  Select, 
  Space, 
  Typography, 
  Spin,
  Row,
  Col,
  Divider
} from 'antd'
import { 
  SearchOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'

const { Option } = Select

const { Title, Text } = Typography
const { Search } = Input

interface User {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin'
  isActive: boolean
  createdAt: string
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = !roleFilter || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const getRoleTag = (role: string) => {
    const colorMap = {
      student: 'blue',
      teacher: 'green',
      admin: 'purple'
    }
    const textMap = {
      student: '学生',
      teacher: '教师',
      admin: '管理员'
    }
    return (
      <Tag color={colorMap[role as keyof typeof colorMap] || 'default'}>
        {textMap[role as keyof typeof textMap] || role}
      </Tag>
    )
  }

  const getStatusTag = (isActive: boolean) => {
    return isActive ? (
      <Tag icon={<CheckCircleOutlined />} color="success">
        活跃
      </Tag>
    ) : (
      <Tag icon={<CloseCircleOutlined />} color="error">
        禁用
      </Tag>
    )
  }

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => getRoleTag(role)
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => getStatusTag(isActive)
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: User) => (
        <Space size="small">
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button 
            type="link" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  const handleEdit = (user: User) => {
    console.log('Edit user:', user)
    // TODO: 实现编辑功能
  }

  const handleDelete = (user: User) => {
    console.log('Delete user:', user)
    // TODO: 实现删除功能
  }

  const handleAddUser = () => {
    console.log('Add new user')
    // TODO: 实现添加用户功能
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
        <Title level={2}>用户管理</Title>
        <Text type="secondary">管理系统中的所有用户账户</Text>
      </div>

      {/* 搜索和过滤 */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Search
              placeholder="搜索用户姓名或邮箱"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col>
            <Select
              placeholder="选择角色"
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ width: 120 }}
              allowClear
            >
              <Option value="">全部角色</Option>
              <Option value="student">学生</Option>
              <Option value="teacher">教师</Option>
              {/* <Option value="admin">管理员</Option> */}
            </Select>
          </Col>
          <Col>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAddUser}
            >
              添加用户
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 用户列表 */}
      <Card>
        <div style={{ marginBottom: '16px' }}>
          <Text strong>用户列表 ({filteredUsers.length})</Text>
        </div>
        <Table
          columns={columns}
          dataSource={filteredUsers}
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
