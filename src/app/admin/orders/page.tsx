'use client'

import { useState, useEffect, useRef } from 'react'
import { ORDER_TIME_RANGES, orderRangeToDates } from '@/lib/utils'

const TABS = ['全部', '待付款', '待制作', '配送中', '已完成']
const STATUS_MAP: Record<string, string> = { '全部': '', '待付款': 'pending', '待制作': 'paid', '配送中': 'delivering', '已完成': 'completed' }

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('全部')
  const [exporting, setExporting] = useState(false)
  const [trackingInput, setTrackingInput] = useState<{ id: string; show: boolean; value: string }>({ id: '', show: false, value: '' })
  // 时间筛选与店主端订单页同一套（共用 lib/utils 的快捷档换算），
  // 并且会一并带进导出请求——不筛的话导出永远是全量
  const [timeKey, setTimeKey] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  // 从「顾客已付款」通知点进来时，要定位到那一单
  const [highlightId, setHighlightId] = useState('')
  const [focusNotice, setFocusNotice] = useState('')
  const fetchedTargetRef = useRef(false)

  useEffect(() => { fetchOrders() }, [tab, timeKey, startDate, endDate])

  // 读 ?orderId=
  // 刻意不用 useSearchParams：这个项目没有任何页面用过它，也没有 <Suspense> 边界，
  // App Router 预渲染这些客户端页面时会直接报 missing-suspense-with-csr-bailout。
  // 纯客户端读 window.location.search 一样稳，且零构建风险。
  useEffect(() => {
    const targetId = new URLSearchParams(window.location.search).get('orderId')
    if (!targetId) return
    setHighlightId(targetId)
    // 目标订单可能不在当前筛选的 tab 里，先归位到「全部」再找
    setTab('全部')
  }, [])

  // 定位：等数据加载完把目标卡片滚进视口并高亮
  useEffect(() => {
    if (!highlightId || loading) return

    if (orders.some(o => o.id === highlightId)) {
      document.getElementById(`order-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => setHighlightId(''), 5000)   // 高亮圈过几秒淡出，免得一直挂着
      return () => clearTimeout(timer)
    }

    // 不在列表里：订单接口默认只返回前 20 条，老订单会漏。单独拉这一单插到最前面。
    if (fetchedTargetRef.current) return
    fetchedTargetRef.current = true
    let alive = true
    fetch(`/api/orders/${highlightId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!alive) return
        if (data?.order) setOrders(prev => prev.some(o => o.id === data.order.id) ? prev : [data.order, ...prev])
        else setFocusNotice('通知里的订单已不存在，可能已被删除')
      })
      .catch(() => { if (alive) setFocusNotice('订单不在当前页，且加载失败，请在「全部」里翻找') })
    return () => { alive = false }
  }, [highlightId, loading, orders])

  /** 当前筛选条件 → 查询参数。列表与导出共用，否则两边迟早对不上 */
  const buildFilters = () => {
    const params = new URLSearchParams()
    const s = STATUS_MAP[tab]
    if (s) params.set('status', s)
    const dates = timeKey === 'custom' ? { startDate, endDate } : orderRangeToDates(timeKey)
    if (dates.startDate) params.set('startDate', dates.startDate)
    if (dates.endDate) params.set('endDate', dates.endDate)
    return params
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders?${buildFilters()}`)
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
      // 带上当前筛选条件：店主筛出「上个月 / 待付款」再点导出，
      // 拿到的就应该是那一批，而不是全量 CSV 让他自己去 Excel 里删
      const res = await fetch(`/api/orders/export?${buildFilters()}`)
      if (!res.ok) {
        setFocusNotice('导出失败，请确认登录状态后重试')
        setExporting(false)
        return
      }
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

      <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}>{t}</button>
        ))}
      </div>

      {/* 时间筛选：控件与店主端订单页一致（快捷档 + 自定义起止）。
          下面的「导出CSV」会带上这里的条件一起请求 */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {ORDER_TIME_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => { setTimeKey(r.key); setStartDate(''); setEndDate('') }}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${timeKey === r.key ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}
            >{r.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => { setTimeKey('custom'); setStartDate(e.target.value) }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-warm-300 text-xs bg-white text-text-secondary"
          />
          <span className="text-xs text-text-light">至</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setTimeKey('custom'); setEndDate(e.target.value) }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-warm-300 text-xs bg-white text-text-secondary"
          />
        </div>
        <p className="text-[10px] text-text-light">导出 CSV 会按上面选中的状态与日期区间筛选</p>
      </div>

      {focusNotice && (
        <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-700">{focusNotice}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无订单</p></div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div
              key={order.id}
              id={`order-${order.id}`}
              className={`card transition-shadow ${highlightId === order.id ? 'ring-2 ring-primary-500 shadow-lg' : ''}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-text-light">#{order.orderNo?.slice(-8)}</span>
                <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span>
              </div>
              <div className="text-sm text-text-primary mb-2">
                {order.items?.map((item: any, i: number) => (
                  <span key={i} className="mr-3">{item.name} x{item.quantity}</span>
                ))}
                {/* 赠品也列在这里：打包的人看的就是这一行，不能只在别处提一句 */}
                {order.giftName && order.giftQuantity > 0 && (
                  <span className="text-primary-500">🎁 {order.giftName} x{order.giftQuantity}</span>
                )}
              </div>
              <p className="text-xs text-text-light mb-1">{new Date(order.createdAt).toLocaleString('zh-CN')}</p>
              {order.address && <p className="text-xs text-text-light mb-2">📍 {order.address.name} {order.address.phone} {order.address.detail}</p>}
              {order.trackingNo && <p className="text-xs text-blue-500 mb-2">📦 物流单号：{order.trackingNo}</p>}
              {/* 顾客点过「已扫码支付」：提醒店主核对到账，这就是后台要处理的待办 */}
              {order.status === 'pending' && order.payClaimedAt && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2">
                  💬 顾客已于 {new Date(order.payClaimedAt).toLocaleString('zh-CN')} 告知已付款，请核对到账后确认收款
                </p>
              )}

              {/* Tracking input */}
              {trackingInput.show && trackingInput.id === order.id && (
                <div className="flex gap-2 mb-2">
                  <input className="input-field text-xs flex-1" placeholder="输入物流单号" value={trackingInput.value} onChange={e => setTrackingInput(p => ({...p, value: e.target.value}))} />
                  <button onClick={() => handleShip(order)} className="px-3 py-1.5 text-xs rounded-full bg-primary-500 text-white">确认发货</button>
                </div>
              )}

              {(order.couponDiscount > 0 || order.memberDiscount > 0 || order.giftName || order.deliveryFee > 0) && (
                // 对账提示：实收低于商品原价时，让店主一眼看出优惠去了哪里；
                // 赠品不减钱但也要记一笔，否则这一单「为什么少发了东西」事后查不出来。
                // 运费是加项（实收高于商品金额），所以要单独标 + 号，别让人误以为又是优惠。
                <p className="text-[10px] text-text-light pt-2">
                  商品 ¥{(order.itemsAmount || 0).toFixed(2)}
                  {order.deliveryFee > 0 && ` · 运费 +¥${order.deliveryFee.toFixed(2)}`}
                  {order.couponDiscount > 0 && ` · 优惠券 -¥${order.couponDiscount.toFixed(2)}`}
                  {order.memberDiscount > 0 && ` · 会员折扣 -¥${order.memberDiscount.toFixed(2)}`}
                  {order.giftName && order.giftQuantity > 0 && ` · 赠品 ${order.giftName} ×${order.giftQuantity}`}
                </p>
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
