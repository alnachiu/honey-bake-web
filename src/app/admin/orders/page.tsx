'use client'

import { useState, useEffect } from 'react'

const TABS = ['全部', '待付款', '待制作', '配送中', '已完成']
const STATUS_MAP: Record<string, string> = { '全部': '', '待付款': 'pending', '待制作': 'paid', '配送中': 'delivering', '已完成': 'completed' }

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('全部')
  const [exporting, setExporting] = useState(false)
  const [trackingInput, setTrackingInput] = useState<{ id: string; show: boolean; value: string }>({ id: '', show: false, value: '' })

  useEffect(() => { fetchOrders() }, [tab])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const s = STATUS_MAP[tab]
      if (s) params.set('status', s)
      const res = await fetch(`/api/orders?${params}`)
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const updateStatus = async (id: string, status: string, trackingNo?: string) => {
    try {
      const body: any = { status }
      if (trackingNo) body.trackingNo = trackingNo
      await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      fetchOrders()
    } catch (err) { console.error(err) }
  }

  const handleShip = (order: any) => {
    if (trackingInput.show && trackingInput.id === order.id && trackingInput.value) {
      updateStatus(order.id, 'delivering', trackingInput.value)
      setTrackingInput({ id: '', show: false, value: '' })
    } else {
      setTrackingInput({ id: order.id, show: true, value: order.trackingNo || '' })
    }
  }

  const getStatusText = (s: string) => ({ pending: '待付款', paid: '待制作', making: '制作中', delivering: '配送中', completed: '已完成', cancelled: '已取消' }[s] || s)
  const getStatusColor = (s: string) => s === 'pending' ? 'text-yellow-500' : s === 'paid' ? 'text-green-500' : s === 'delivering' ? 'text-primary-500' : 'text-text-light'

  const exportOrders = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/orders/export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err) }
    setExporting(false)
  }

  return (
    <div className="page-container pt-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">📋 订单管理</h1>
        <button onClick={exportOrders} disabled={exporting} className="px-3 py-1.5 text-xs rounded-full bg-green-500 text-white">
          {exporting ? '导出中...' : '📥 导出CSV'}
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无订单</p></div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="card">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-text-light">#{order.orderNo?.slice(-8)}</span>
                <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span>
              </div>
              <div className="text-sm text-text-primary mb-2">
                {order.items?.map((item: any, i: number) => (
                  <span key={i} className="mr-3">{item.name} x{item.quantity}</span>
                ))}
              </div>
              <p className="text-xs text-text-light mb-1">{new Date(order.createdAt).toLocaleString('zh-CN')}</p>
              {order.address && <p className="text-xs text-text-light mb-2">📍 {order.address.name} {order.address.phone} {order.address.detail}</p>}
              {order.trackingNo && <p className="text-xs text-blue-500 mb-2">📦 物流单号：{order.trackingNo}</p>}

              {/* Tracking input */}
              {trackingInput.show && trackingInput.id === order.id && (
                <div className="flex gap-2 mb-2">
                  <input className="input-field text-xs flex-1" placeholder="输入物流单号" value={trackingInput.value} onChange={e => setTrackingInput(p => ({...p, value: e.target.value}))} />
                  <button onClick={() => handleShip(order)} className="px-3 py-1.5 text-xs rounded-full bg-primary-500 text-white">确认发货</button>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-warm-100">
                <span className="font-semibold text-primary-500">¥{order.totalAmount.toFixed(2)}</span>
                <div className="flex gap-2 flex-wrap">
                  {order.status === 'pending' && (
                    <button onClick={() => updateStatus(order.id, 'paid')} className="px-3 py-1.5 text-xs rounded-full bg-green-500 text-white">💰 确认收款</button>
                  )}
                  {order.status === 'paid' && (
                    <button onClick={() => handleShip(order)} className="px-3 py-1.5 text-xs rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">🚚 发货</button>
                  )}
                  {order.status === 'making' && (
                    <button onClick={() => updateStatus(order.id, 'delivering')} className="px-3 py-1.5 text-xs rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">开始配送</button>
                  )}
                  {order.status === 'delivering' && !trackingInput.show && (
                    <button onClick={() => setTrackingInput({ id: order.id, show: true, value: order.trackingNo || '' })} className="px-3 py-1.5 text-xs rounded-full border border-warm-300 text-text-secondary">📦 录入单号</button>
                  )}
                  {order.status === 'delivering' && (
                    <button onClick={() => updateStatus(order.id, 'completed')} className="px-3 py-1.5 text-xs rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">完成配送</button>
                  )}
                  {order.status === 'paid' && (
                    <button onClick={() => updateStatus(order.id, 'cancelled')} className="px-3 py-1.5 text-xs rounded-full border border-red-200 text-red-400">取消</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-text-light text-center mt-4 pb-4">
        💡 订单配送超过7天消费者未确认，系统自动标记为已完成
      </div>
    </div>
  )
}
