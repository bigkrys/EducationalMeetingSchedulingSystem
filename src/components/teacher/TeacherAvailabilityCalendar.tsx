'use client'

import React, { useState, useEffect } from 'react'
import { Card, Button, Space, Modal, Form, Tag, Empty } from 'antd'
import {
  showApiError,
  showSuccessMessage,
  showErrorMessage,
  showWarningMessage,
} from '@/lib/api/global-error-handler'
import { PlusOutlined, ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { format, parseISO } from 'date-fns'
import { api } from '@/lib/api/http-client'
import { useFetch } from '@/lib/frontend/useFetch'
import { createUtcDateTime } from '@/lib/utils/timezone-client'
import AddAvailabilityModal from './AddAvailabilityModal'
import AddBlockedTimeModal from './AddBlockedTimeModal'

export interface TeacherAvailabilityData {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface BlockedTimeData {
  id: string
  startTime: string
  endTime: string
  reason?: string
}

interface TeacherAvailabilityCalendarProps {
  teacherId: string
  teacherName: string
  onRefresh?: () => void
}

const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const TeacherAvailabilityCalendar: React.FC<TeacherAvailabilityCalendarProps> = ({
  teacherId,
  teacherName,
  onRefresh,
}) => {
  const [availability, setAvailability] = useState<TeacherAvailabilityData[]>([])
  const [blockedTimes, setBlockedTimes] = useState<BlockedTimeData[]>([])
  const [loading, setLoading] = useState(false)
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [isBlockModalVisible, setIsBlockModalVisible] = useState(false)
  const [submittingAdd, setSubmittingAdd] = useState(false)
  const [submittingBlock, setSubmittingBlock] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [blockForm] = Form.useForm()
  const [conflictsVisible, setConflictsVisible] = useState(false)
  const [conflicts, setConflicts] = useState<any[]>([])
  // 获取可用性数据
  const { fetchWithAuth } = useFetch()

  const fetchAvailability = React.useCallback(async () => {
    setLoading(true)
    try {
      const { res: response, json: data } = await fetchWithAuth(
        `/api/teachers/${teacherId}/availability`
      )

      if (response.ok) {
        // data is the already-parsed json
        let availabilityArray = []
        if (Array.isArray(data)) {
          // 直接返回数组的情况
          availabilityArray = data
        } else if (data && data.availability && Array.isArray(data.availability)) {
          // 返回 {availability: [...], ...} 格式的情况
          availabilityArray = data.availability
        } else {
          console.warn('API返回的可用性数据格式不支持:', data)
          availabilityArray = []
        }

        // 确保数据是数组
        if (availabilityArray.length > 0) {
          const availabilityData = availabilityArray.map((item: any) => {
            return {
              id: item.id,
              dayOfWeek: item.dayOfWeek,
              startTime: item.startTime,
              endTime: item.endTime,
              isActive: item.isRecurring === true || item.isActive === true,
            }
          })
          setAvailability(availabilityData)
        } else {
          setAvailability([])
        }
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
      }
    } catch (error) {
      showErrorMessage('获取可用性数据失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId, fetchWithAuth])

  // 获取阻塞时间数据
  const fetchBlockedTimes = React.useCallback(async () => {
    try {
      const { res: response, json: data } = await fetchWithAuth(
        `/api/blocked-times?teacherId=${teacherId}`
      )

      if (response.ok) {
        // data is parsed JSON
        let blockedTimesArray = []
        if (Array.isArray(data)) {
          // 直接返回数组的情况
          blockedTimesArray = data
        } else if (data && data.blockedTimes && Array.isArray(data.blockedTimes)) {
          // 返回 {blockedTimes: [...], ...} 格式的情况
          blockedTimesArray = data.blockedTimes
        } else {
          console.warn('API返回的阻塞时间数据格式不支持:', data)
          blockedTimesArray = []
        }

        // 过滤当前教师的阻塞时间
        const teacherBlockedTimes = blockedTimesArray.filter(
          (item: any) => item.teacherId === teacherId
        )
        setBlockedTimes(teacherBlockedTimes)
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
      }
    } catch (error) {
      showErrorMessage('获取阻塞时间失败')
    }
  }, [teacherId, fetchWithAuth])

  useEffect(() => {
    fetchAvailability()
    fetchBlockedTimes()
  }, [fetchAvailability, fetchBlockedTimes])

  useEffect(() => {
    return () => {
      // 清空表单数据
      form.resetFields()
      blockForm.resetFields()
    }
  })

  // 添加可用性
  const handleAddAvailability = async (values: any) => {
    if (submittingAdd) return
    setSubmittingAdd(true)
    try {
      // 处理多个时间段
      if (values.timeSlots && Array.isArray(values.timeSlots)) {
        // 批量添加多个时间段
        const promises = values.timeSlots.map(async (slot: any) => {
          if (!slot.startTime || !slot.endTime) {
            throw new Error('时间段数据不完整')
          }

          const availabilityData = {
            teacherId: teacherId,
            dayOfWeek: values.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isRecurring: values.isRecurring,
          }

          const { res: response, json: result } = await fetchWithAuth(
            `/api/teachers/${teacherId}/availability`,
            {
              method: 'POST',
              jsonBody: availabilityData,
            }
          )

          if (!response.ok) {
            // 安全解析响应体（可能不是 JSON）
            let errorData: any = null
            try {
              errorData = await response.json()
            } catch (e) {
              console.warn('无法解析错误响应为 JSON', e)
            }

            const code = errorData?.code ?? errorData?.error ?? 'UNKNOWN_ERROR'
            const message = errorData?.message ?? '添加可用性失败'

            // 后端可能把冲突信息放在 details.conflicts 或 top-level conflicts
            const conflictsArr = errorData?.details?.conflicts ?? errorData?.conflicts ?? null
            if (Array.isArray(conflictsArr) && conflictsArr.length > 0) {
              setConflicts(conflictsArr)
              setConflictsVisible(true)
            }
            // showApiError({ code, message: message })
            throw new Error(message)
          }

          // 如果后端返回与 blockedTime 的 warnings，提示用户（但仍视为成功）
          if (
            result &&
            result.blockedTimeWarnings &&
            Array.isArray(result.blockedTimeWarnings) &&
            result.blockedTimeWarnings.length > 0
          ) {
            showWarningMessage(
              '已创建可用时间，但检测到与阻塞时间的冲突，相关时段将不会对学生显示为可预约。'
            )
          }

          return result
        })

        await Promise.all(promises)
        showSuccessMessage('可用性设置成功')
        form.resetFields()
        setIsAddModalVisible(false)
        fetchAvailability()
        onRefresh?.()
      } else {
        showErrorMessage('时间段数据格式错误')
      }
    } catch (error) {
      // showErrorMessage(error instanceof Error ? error.message : '添加可用性失败')
    } finally {
      setSubmittingAdd(false)
    }
  }

  // 删除可用性
  const handleDeleteAvailability = async (id: string) => {
    if (deletingId) return
    setDeletingId(id)
    try {
      setLoading(true)
      const { res: response, json } = await fetchWithAuth(
        `/api/teachers/${teacherId}/availability/${id}`,
        {
          method: 'DELETE',
        }
      )
      setLoading(false)
      if (response.ok) {
        showSuccessMessage('\u53ef\u7528\u6027\u5df2\u5220\u9664')
        fetchAvailability()
        onRefresh?.()
      } else {
        showApiError({ code: json?.code ?? json?.error, message: json?.message })
      }
    } catch (error) {
      showErrorMessage('\u5220\u9664\u5931\u8d25')
    } finally {
      setDeletingId(null)
      setLoading(false)
    }
  }

  // 添加阻塞时间
  const handleAddBlockedTime = async (values: any) => {
    if (submittingBlock) {
      return
    }
    setSubmittingBlock(true)
    try {
      const timeRange = values?.timeRange
      if (!Array.isArray(timeRange) || timeRange.length < 2 || !timeRange[0] || !timeRange[1]) {
        showErrorMessage('请选择开始和结束时间')
        setSubmittingBlock(false)
        return
      }
      const [startTime, endTime] = timeRange

      const toISO = (v: any) => {
        try {
          if (v && typeof v.toISOString === 'function') return v.toISOString()
          if (v && typeof v.toDate === 'function') return v.toDate().toISOString()
          return new Date(v).toISOString()
        } catch {
          return new Date().toISOString()
        }
      }

      const blockedTimeData = {
        teacherId: teacherId,
        startTime: toISO(startTime),
        endTime: toISO(endTime),
        reason: values.reason,
      }

      setLoading(true)

      const { res: response, json: result } = await fetchWithAuth('/api/blocked-times', {
        method: 'POST',
        jsonBody: blockedTimeData,
      })
      setLoading(false)
      if (response.ok) {
        // 如果后端返回 availabilityConflicts，提示用户但仍认为创建成功
        if (
          result &&
          result.availabilityConflicts &&
          Array.isArray(result.availabilityConflicts) &&
          result.availabilityConflicts.length > 0
        ) {
          Modal.info({
            title: '已添加阻塞时间（存在与可用时间的冲突）',
            content: (
              <div>
                <p>阻塞时间已创建，但与下列每周可用时间存在冲突：</p>
                <ul>
                  {result.availabilityConflicts.map((c: any) => (
                    <li key={c.id}>{`周${c.dayOfWeek} ${c.startTime}-${c.endTime}`}</li>
                  ))}
                </ul>
                <p>这些可用时间段在学生查询/创建预约时会被过滤。</p>
              </div>
            ),
            onOk() {},
          })
        } else {
          showSuccessMessage('阻塞时间已添加')
        }

        blockForm.resetFields()
        setIsBlockModalVisible(false)
        fetchBlockedTimes()
      } else {
        const errorData = await response.json()
        showApiError({ code: errorData?.code ?? errorData?.error, message: errorData?.message })
      }
    } catch (error) {
      console.error(error)
      showErrorMessage('添加阻塞时间失败')
    } finally {
      setSubmittingBlock(false)
    }
  }

  // 删除阻塞时间
  const handleDeleteBlockedTime = async (id: string) => {
    try {
      const { res: response, json } = await fetchWithAuth(`/api/blocked-times?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        showSuccessMessage('\u963b\u585e\u65f6\u95f4\u5df2\u5220\u9664')
        fetchBlockedTimes()
      } else {
        showApiError({ code: json?.code ?? json?.error, message: json?.message })
      }
    } catch (error) {
      showErrorMessage('删除失败')
    }
  }

  // 按星期分组可用性
  const groupedAvailability = Array.isArray(availability)
    ? availability.reduce(
        (groups, item) => {
          const day = item.dayOfWeek
          if (!groups[day]) {
            groups[day] = []
          }
          groups[day].push(item)
          return groups
        },
        {} as Record<number, TeacherAvailabilityData[]>
      )
    : {}

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">{teacherName} 的可用性设置</h3>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsAddModalVisible(true)}
            loading={submittingAdd}
            disabled={submittingAdd}
          >
            添加可用时间
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            onClick={() => setIsBlockModalVisible(true)}
            loading={submittingBlock}
            disabled={submittingBlock}
          >
            添加阻塞时间
          </Button>
        </Space>
      </div>

      {/* 每周可用性 */}
      <Card title="每周可用性" className="mb-6">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">📅 可用性设置说明：</p>
            <p>• 时间段重叠检测仅在同一个星期几内进行</p>
            <p>• 不同星期几的相同时间段不会被认为是重叠的</p>
            <p>• 例如：周一 09:00-10:00 和周二 09:00-10:00 可以同时存在</p>
          </div>
        </div>

        {!Array.isArray(availability) || Object.keys(groupedAvailability).length === 0 ? (
          <Empty description="暂无可用性设置" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groupedAvailability).map(([day, items]) => (
              <Card key={day} size="small" title={DAYS[parseInt(day)]}>
                <div className="space-y-2">
                  {Array.isArray(items) &&
                    items.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded"
                      >
                        <div className="text-sm">
                          <span className="font-medium">
                            {item.startTime} - {item.endTime}
                          </span>
                          {(() => {
                            try {
                              const sUtc = new Date(createUtcDateTime(item.startTime))
                                .toISOString()
                                .slice(11, 16)
                              const eUtc = new Date(createUtcDateTime(item.endTime))
                                .toISOString()
                                .slice(11, 16)
                              return (
                                <Tag color="geekblue" style={{ marginLeft: 8 }}>
                                  UTC: {sUtc} - {eUtc}
                                </Tag>
                              )
                            } catch {
                              return null
                            }
                          })()}
                        </div>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteAvailability(item.id)}
                          loading={deletingId === item.id}
                          disabled={!!deletingId}
                        />
                      </div>
                    ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* 冲突详情弹窗 */}
      <Modal
        title="时间冲突详情"
        open={conflictsVisible}
        onCancel={() => setConflictsVisible(false)}
        onOk={() => setConflictsVisible(false)}
      >
        {Array.isArray(conflicts) && conflicts.length > 0 ? (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {conflicts.map((c: any, idx: number) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <Tag color="red" style={{ marginBottom: 6 }}>
                  {c.type || 'conflict'}
                </Tag>
                <div style={{ color: '#444' }}>{c.message || '存在时间冲突'}</div>
                {c.existingSlot && (
                  <div style={{ color: '#666', fontSize: 12 }}>
                    现有：{c.existingSlot.startTime}-{c.existingSlot.endTime}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>存在时间冲突，请调整后重试。</div>
        )}
      </Modal>

      {/* 阻塞时间 */}
      <Card title="阻塞时间" style={{ marginTop: '20px' }}>
        {!Array.isArray(blockedTimes) || blockedTimes.length === 0 ? (
          <Empty description="暂无阻塞时间设置" />
        ) : (
          <div className="space-y-3">
            {blockedTimes.map((blockedTime) => (
              <div
                key={blockedTime.id}
                className="flex justify-between items-center p-3  border border-gray-300 rounded"
              >
                <div>
                  <div className="font-medium ">
                    {format(parseISO(blockedTime.startTime), 'yyyy年MM月dd日 HH:mm')} -
                    {format(parseISO(blockedTime.endTime), 'HH:mm')}
                  </div>
                  {blockedTime.reason && (
                    <div className="text-sm  mt-1">原因：{blockedTime.reason}</div>
                  )}
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteBlockedTime(blockedTime.id)}
                  loading={deletingId === blockedTime.id}
                  disabled={!!deletingId}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 添加可用性弹窗 */}
      <AddAvailabilityModal
        visible={isAddModalVisible}
        onCancel={() => setIsAddModalVisible(false)}
        onSubmit={handleAddAvailability}
        form={form}
        submitting={submittingAdd}
      />

      {/* 添加阻塞时间弹窗（独立组件） */}
      <AddBlockedTimeModal
        visible={isBlockModalVisible}
        onCancel={() => setIsBlockModalVisible(false)}
        onSubmit={handleAddBlockedTime}
        form={blockForm}
        submitting={submittingBlock}
      />
    </div>
  )
}

export default TeacherAvailabilityCalendar
