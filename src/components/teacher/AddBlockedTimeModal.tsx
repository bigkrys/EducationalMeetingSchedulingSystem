'use client'

import React from 'react'
import { Modal, Form, Select, DatePicker, Button } from 'antd'
import { showErrorMessage } from '@/lib/api/global-error-handler'

const { Option } = Select
const { RangePicker } = DatePicker

interface AddBlockedTimeModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: any) => void
  form: any
  submitting?: boolean
}

export default function AddBlockedTimeModal({
  visible,
  onCancel,
  onSubmit,
  form,
  submitting = false,
}: AddBlockedTimeModalProps) {
  const handleFinish = () => {
    form
      .validateFields()
      .then((values: any) => {
        if (!values.timeRange || values.timeRange.length !== 2) {
          form.setFields([
            {
              name: 'timeRange',
              errors: ['请选择有效的时间范围'],
            },
          ])
          return
        }
        console.log('Blocked time values:', values)
        onSubmit(values)
      })
      .catch((info: any) => {
        console.log('Validate Failed:', info)
        showErrorMessage('请检查表单中的错误项并修正后再提交')
      })
  }

  return (
    <Modal
      title="添加阻塞时间"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
      maskClosable={!submitting}
      keyboard={!submitting}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="timeRange"
          label="时间范围"
          rules={[{ required: true, message: '请选择时间范围' }]}
        >
          <RangePicker
            showTime
            format="YYYY-MM-DD HH:mm:ss"
            placeholder={['开始时间', '结束时间']}
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          name="reason"
          label="阻塞原因"
          rules={[{ required: true, message: '请输入阻塞原因' }]}
        >
          <Select placeholder="请选择阻塞原因">
            <Option value="会议">会议</Option>
            <Option value="个人事务">个人事务</Option>
            <Option value="休假">休假</Option>
            <Option value="其他">其他</Option>
          </Select>
        </Form.Item>

        <Form.Item className="mb-0">
          <div className="flex justify-end space-x-3">
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" onClick={handleFinish} loading={submitting} disabled={submitting}>
              确认添加
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}
