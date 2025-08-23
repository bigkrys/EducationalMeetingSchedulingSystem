'use client'

import { Input, Select, DatePicker, InputNumber, Switch, Form } from 'antd'

const { Option } = Select
const { TextArea } = Input

interface FormFieldProps {
  type: 'input' | 'select' | 'date' | 'datetime' | 'number' | 'textarea' | 'switch' | 'password'
  name: string
  label: string
  placeholder?: string
  required?: boolean
  options?: Array<{ label: string; value: any }>
  rules?: any[]
  disabled?: boolean
  [key: string]: any
}

export default function FormField({
  type,
  name,
  label,
  placeholder,
  required = false,
  options = [],
  rules = [],
  disabled = false,
  ...rest
}: FormFieldProps) {
  const baseRules = required ? [{ required: true, message: `请输入${label}` }] : []
  const finalRules = [...baseRules, ...rules]

  const renderField = () => {
    switch (type) {
      case 'input':
        return (
          <Input
            placeholder={placeholder || `请输入${label}`}
            disabled={disabled}
            {...rest}
          />
        )
      
      case 'password':
        return (
          <Input.Password
            placeholder={placeholder || `请输入${label}`}
            disabled={disabled}
            {...rest}
          />
        )
      
      case 'select':
        return (
          <Select
            placeholder={placeholder || `请选择${label}`}
            disabled={disabled}
            {...rest}
          >
            {options.map(option => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        )
      
      case 'date':
        return (
          <DatePicker
            placeholder={placeholder || `请选择${label}`}
            disabled={disabled}
            format="YYYY-MM-DD"
            {...rest}
          />
        )
      
      case 'datetime':
        return (
          <DatePicker
            showTime
            placeholder={placeholder || `请选择${label}`}
            disabled={disabled}
            format="YYYY-MM-DD HH:mm:ss"
            {...rest}
          />
        )
      
      case 'number':
        return (
          <InputNumber
            placeholder={placeholder || `请输入${label}`}
            disabled={disabled}
            className="w-full"
            {...rest}
          />
        )
      
      case 'textarea':
        return (
          <TextArea
            placeholder={placeholder || `请输入${label}`}
            disabled={disabled}
            rows={4}
            {...rest}
          />
        )
      
      case 'switch':
        return (
          <Switch
            disabled={disabled}
            checkedChildren="是"
            unCheckedChildren="否"
            {...rest}
          />
        )
      
      default:
        return (
          <Input
            placeholder={placeholder || `请输入${label}`}
            disabled={disabled}
            {...rest}
          />
        )
    }
  }

  return (
    <Form.Item
      name={name}
      label={label}
      rules={finalRules}
    >
      {renderField()}
    </Form.Item>
  )
}
