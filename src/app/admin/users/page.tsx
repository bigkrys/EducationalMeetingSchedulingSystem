'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Typography,
  Button,
  Table,
  Space,
  Tag,
  Input,
  Select,
  Modal,
  Form,
  message,
} from 'antd'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import Link from 'next/link'
import { getCurrentUserRole } from '@/lib/api/auth'

const { Title, Text } = Typography

interface UserRow {
  id: string
  email: string
  name: string
  role: 'student' | 'teacher' | 'admin' | 'superadmin'
  status: string
  createdAt: string
}

export default function AdminUsers() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<string | undefined>(undefined)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const currentRole = useMemo(() => getCurrentUserRole(), [])

  const fetchUsers = async (params?: {
    page?: number
    limit?: number
    role?: string
    search?: string
  }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
    if (!token) return message.error('未找到登录信息，请重新登录')
    setLoading(true)
    try {
      const p = params?.page ?? page
      const l = params?.limit ?? limit
      const r = params?.role ?? role
      const s = params?.search ?? search
      const qs = new URLSearchParams()
      qs.set('page', String(p))
      qs.set('limit', String(l))
      if (r) qs.set('role', r)
      if (s) qs.set('search', s)
      const res = await fetch(`/api/admin/users?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('加载用户失败')
      const json = await res.json()
      setUsers(
        (json.users || []).map((u: any) => ({
          ...u,
          createdAt: u.createdAt,
        }))
      )
      setTotal(json.total || 0)
      setPage(json.page || p)
      setLimit(json.limit || l)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (r: any) => {
        const color =
          r === 'superadmin'
            ? 'magenta'
            : r === 'admin'
              ? 'red'
              : r === 'teacher'
                ? 'blue'
                : 'green'
        const label =
          r === 'student'
            ? '学生'
            : r === 'teacher'
              ? '教师'
              : r === 'admin'
                ? '管理员'
                : '超级管理员'
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : s === 'suspended' ? 'orange' : 'default'}>{s}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: UserRow) => {
        const isPrivileged = record.role === 'admin' || (record as any).role === 'superadmin'
        const canEdit = currentRole === 'superadmin' || !isPrivileged
        return (
          <Space>
            <Button size="small" onClick={() => onEdit(record)} disabled={!canEdit}>
              编辑
            </Button>
          </Space>
        )
      },
    },
  ]

  const onEdit = (row: UserRow) => {
    setEditing(row)
    editForm.setFieldsValue({
      name: row.name,
      email: row.email,
      status: row.status || 'active',
    })
    setEditOpen(true)
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('创建失败')
      message.success('创建成功')
      setCreateOpen(false)
      form.resetFields()
      fetchUsers({ page: 1 })
    } catch (e) {
      if (e instanceof Error) message.error(e.message)
    }
  }

  const handleUpdate = async () => {
    try {
      if (!editing) return
      const values = await editForm.validateFields()
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: editing.id, updates: values }),
      })
      if (!res.ok) throw new Error('更新失败')
      message.success('更新成功')
      setEditOpen(false)
      setEditing(null)
      fetchUsers()
    } catch (e) {
      if (e instanceof Error) message.error(e.message)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="flex items-center justify-between">
          <Title level={3} style={{ margin: 0 }}>
            用户管理
          </Title>
          <Space>
            <Link href="/admin">
              <Button>返回控制台</Button>
            </Link>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              新建用户
            </Button>
          </Space>
        </div>

        <Card>
          <Space style={{ marginBottom: 16 }} wrap>
            <Input.Search
              placeholder="按姓名/邮箱搜索"
              allowClear
              onSearch={(v) => {
                setSearch(v)
                fetchUsers({ page: 1, search: v })
              }}
              style={{ width: 280 }}
            />
            <Select
              placeholder="角色过滤"
              allowClear
              value={role}
              style={{ width: 160 }}
              options={[
                { value: 'student', label: '学生' },
                { value: 'teacher', label: '教师' },
                ...(currentRole === 'superadmin' ? [{ value: 'admin', label: '管理员' }] : []),
              ]}
              onChange={(v) => {
                setRole(v)
                fetchUsers({ page: 1, role: v })
              }}
            />
          </Space>

          <Table
            rowKey="id"
            loading={loading}
            dataSource={users}
            columns={columns as any}
            pagination={{
              current: page,
              pageSize: limit,
              total,
              showSizeChanger: true,
              onChange: (p, ps) => {
                setPage(p)
                setLimit(ps)
                fetchUsers({ page: p, limit: ps })
              },
            }}
          />
        </Card>
      </Space>

      {/* 创建用户 */}
      <Modal
        title="新建用户"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="张三" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { value: 'student', label: '学生' },
                { value: 'teacher', label: '教师' },
                ...(currentRole === 'superadmin' ? [{ value: 'admin', label: '管理员' }] : []),
              ]}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, message: '请输入初始密码' }]}
          >
            <Input.Password placeholder="至少6位" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户 */}
      <Modal
        title="编辑用户"
        open={editOpen}
        onOk={handleUpdate}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="active">
            <Select
              options={[
                { value: 'active', label: 'active' },
                { value: 'pending', label: 'pending' },
                { value: 'suspended', label: 'suspended' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
