'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { getOrderStatusText } from '@/lib/utils'
import OrderStatusActions from '@/components/OrderStatusActions'

// 消费者只关心自己这几档；店主需要完整状态机（含制作中、已取消）
const USER_TABS = ['全部', '待付款', '待制作', '配送中', '已完成']
const ADMIN_TABS = ['全部', '待付款', '待制作', '制作中', '配送中', '已完成', '已取消']
const STATUS_MAP: Record<string, string> = {
  '全部': '', '待付款': 'pending', '待制作': 'paid', '制作中': 'making',
  '配送中': 'delivering', '已完成': 'completed', '已取消': 'cancelled'
}

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

const TIME_RANGES = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: '7', label: '近7天' },
  { key: '30', label: '近30天' }
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const dayStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** 把快捷档换算成接口要的起止日期（YYYY-MM-DD，含当天两端） */
function rangeToDates(key: string): { startDate: string; endDate: string } {
  if (key === 'all' || key === 'custom') return { startDate: '', endDate: '' }
  const today = new Date()
  const end = dayStr(today)
  if (key === 'today') return { startDate: end, endDate: end }
  const days = Number(key)
  if (!Number.isFinite(days) || days <= 0) return { startDate: '', endDate: '' }
  // 「近 7 天」= 含今天在内的 7 天，所以往前推 6 天
  return { startDate: dayStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))), endDate: end }
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('全部')
  // 以下筛选/分页状态只在店主登录时改变：消费者没有这些控件，
  // 它们的值恒为初值，所以消费者发出的请求与改造前逐字一致（只有 ?status=）。
  const [timeKey, setTimeKey] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    // 必须等认证恢复完再判：user 初值就是 null，抢先判会把
    // 带着有效 cookie 的已登录用户直接踢到登录页（刷新即掉登录的根因）。
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchOrders()
  }, [user, authLoading, tab, timeKey, startDate, endDate, page])

  // 店主改状态后这里要自己变，不用用户手动下拉刷新
  useAutoRefresh(() => fetchOrders(true), 15000, !!user)

  const fetchOrders = async (silent = false) => {
    // 轮询走 silent：不能每次 setLoading(true)，否则列表每 15 秒闪一遍骨架屏
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      const status = STATUS_MAP[tab]
      if (status) params.set('status', status)

      if (isAdmin) {
        // 只有店主的订单管理会走到这里，消费者一个参数都不加
        const dates = timeKey === 'custom' ? { startDate, endDate } : rangeToDates(timeKey)
        if (dates.startDate) params.set('startDate', dates.startDate)
        if (dates.endDate) params.set('endDate', dates.endDate)
        // 每次都要回「已加载的全部」而不是分页 append：15 秒轮询刷新的是同一批数据，
        // append 会让轮询结果和「加载更多」出来的行叠成重复项
        params.set('page', '1')
        params.set('pageSize', String(Math.min(page * PAGE_SIZE, MAX_PAGE_SIZE)))
      }

      const res = await fetch(`/api/orders?${params}`)
      const data = await res.json()
      setOrders(data.orders || [])
      setTotal(typeof data.total === 'number' ? data.total : (data.orders || []).length)
    } catch (err) { console.error(err) }
    if (!silent) setLoading(false)
  }

  // 换筛选条件必须回到第 1 页，否则「在第 3 页切到待付款」会请求一个空页
  const resetTo = (fn: () => void) => { fn(); setPage(1) }

  const pickTime = (key: string) => resetTo(() => {
    setTimeKey(key)
    setStartDate('')
    setEndDate('')
  })

  const pickDate = (which: 'start' | 'end', value: string) => resetTo(() => {
    setTimeKey('custom')
    if (which === 'start') setStartDate(value)
    else setEndDate(value)
  })

  const cancelOrder = async (id: string) => {
    if (!confirm('确定要取消该订单吗？')) return
    try {
      await fetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })
      fetchOrders()
    } catch (err) { console.error(err) }
  }

  const confirmOrder = async (id: string) => {
    if (!confirm('确定已收到商品吗？')) return
    try {
      await fetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })
      fetchOrders()
    } catch (err) { console.error(err) }
  }

  const getStatusColor = (s: string) => ({ pending: 'text-yellow-500', paid: 'text-green-500', making: 'text-blue-500', delivering: 'text-primary-500', completed: 'text-text-light', cancelled: 'text-text-light' }[s] || '')

  const tabs = isAdmin ? ADMIN_TABS : USER_TABS
  const canLoadMore = isAdmin && orders.length > 0 && orders.length < total && orders.length < MAX_PAGE_SIZE

  // 认证还没回来时别急着 return null：那样刷新会白屏一下，
  // 而且空屏期间用户不知道发生了什么。渲染骨架屏顶上。
  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="card h-28 skeleton" />)}
      </div>
    )
  }
  if (!user) return null

  /** 店主看到的卡片：整块信息区是链接，操作区在链接外——
   *  否则单号输入框会被包在 <a> 里，点一下或输一个字就跳走。 */
  const renderAdminCard = (order: any) => {
    const customer = order.address?.name || order.user?.name || ''
    const phone = order.address?.phone || order.user?.phone || ''
    return (
      <div key={order.id} className="card">
        <Link href={`/orders/${order.id}`} className="block">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-text-light">#{order.orderNo?.slice(-8)}</span>
            <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>{getOrderStatusText(order.status)}</span>
          </div>

          {(customer || phone) && (
            <p className="text-xs text-text-secondary mb-2">
              👤 {customer}{phone ? ` · ${phone}` : ''}
            </p>
          )}

          {order.payClaimedAt && order.status === 'pending' && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mb-2">
              顾客称已付款，待你确认收款
            </p>
          )}

          <div className="space-y-1.5">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <img src={item.image || '/placeholder.jpg'} className="w-8 h-8 rounded-lg bg-warm-100 object-cover" />
                <span className="text-sm text-text-primary flex-1 truncate">{item.name}</span>
                <span className="text-xs text-text-light">x{item.quantity}</span>
                <span className="text-sm text-text-primary">¥{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {order.giftName && order.giftQuantity > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-sm flex-shrink-0">🎁</span>
                <span className="text-sm text-text-primary flex-1 truncate">{order.giftName}</span>
                <span className="text-xs text-text-light">x{order.giftQuantity}</span>
                <span className="text-xs text-primary-500">赠品</span>
              </div>
            )}
          </div>

          {/* 对账行：与后台订单页同一口径，改状态前先看清这单该收多少 */}
          <div className="mt-3 pt-2 border-t border-warm-100 space-y-0.5">
            <div className="flex justify-between text-[11px] text-text-light">
              <span>商品 ¥{order.itemsAmount?.toFixed(2)}</span>
              <span>运费 {order.deliveryFee > 0 ? `+¥${order.deliveryFee.toFixed(2)}` : '免'}</span>
              {order.couponDiscount > 0 && <span className="text-primary-500">券 -¥{order.couponDiscount.toFixed(2)}</span>}
              {order.memberDiscount > 0 && <span className="text-primary-500">会员 -¥{order.memberDiscount.toFixed(2)}</span>}
            </div>
          </div>

          {order.trackingNo && <p className="text-[11px] text-blue-500 mt-1.5">📦 {order.trackingNo}</p>}
          {order.remark && <p className="text-[11px] text-text-secondary mt-1.5">备注：{order.remark}</p>}

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-warm-100">
            <span className="text-xs text-text-light">{new Date(order.createdAt).toLocaleString('zh-CN')}</span>
            <span className="text-sm font-semibold text-primary-500">¥{order.totalAmount.toFixed(2)}</span>
          </div>
        </Link>

        <OrderStatusActions order={order} onDone={() => fetchOrders()} />
      </div>
    )
  }

  return (
    <div className="page-container pt-4">
      {isAdmin && (
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-semibold text-text-primary">订单管理</h1>
          <span className="text-xs text-text-light">共 {total} 单</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t} onClick={() => resetTo(() => setTab(t))} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}>{t}</button>
        ))}
      </div>

      {/* 时间筛选：只有店主有 */}
      {isAdmin && (
        <div className="mb-4 space-y-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {TIME_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => pickTime(r.key)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${timeKey === r.key ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}
              >{r.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={e => pickDate('start', e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-warm-300 text-xs bg-white text-text-secondary"
            />
            <span className="text-xs text-text-light">至</span>
            <input
              type="date"
              value={endDate}
              onChange={e => pickDate('end', e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-warm-300 text-xs bg-white text-text-secondary"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card"><div className="h-4 skeleton w-1/3 mb-3" /><div className="h-3 skeleton w-full mb-2" /><div className="h-3 skeleton w-2/3" /></div>)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-text-light">暂无订单</p>
          {/* 店主的列表本来就是空的（管理员不能下单），别给他一个去逛的按钮 */}
          {!isAdmin && <Link href="/" className="btn-primary inline-block mt-4 text-sm">去逛逛</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {isAdmin ? orders.map(renderAdminCard) : orders.map(order => (
            <Link key={order.id} href={`/orders/${order.id}`} className="card block">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-text-light">#{order.orderNo?.slice(-8)}</span>
                <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>{getOrderStatusText(order.status)}</span>
              </div>
              <div className="space-y-1.5">
                {order.items?.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <img src={item.image || '/placeholder.jpg'} className="w-8 h-8 rounded-lg bg-warm-100 object-cover" />
                    <span className="text-sm text-text-primary flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-text-light">x{item.quantity}</span>
                    <span className="text-sm text-text-primary">¥{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                {/* 买赠券带来的赠品，随单配送、不计金额 */}
                {order.giftName && order.giftQuantity > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-sm flex-shrink-0">🎁</span>
                    <span className="text-sm text-text-primary flex-1 truncate">{order.giftName}</span>
                    <span className="text-xs text-text-light">x{order.giftQuantity}</span>
                    <span className="text-xs text-primary-500">赠品</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-warm-100">
                <span className="text-xs text-text-light">{new Date(order.createdAt).toLocaleString('zh-CN')}</span>
                <span className="text-sm font-semibold text-primary-500">¥{order.totalAmount.toFixed(2)}</span>
              </div>
              {order.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={(e) => { e.preventDefault(); cancelOrder(order.id) }} className="flex-1 py-2 rounded-full border border-warm-300 text-xs text-text-secondary">取消</button>
                  {/* 这里不再自行把订单置为 paid：收款与否由店主在后台确认，
                      消费者端只能「声明已付款」（走详情页的已扫码支付）。
                      按钮只是个视觉入口，点它靠外层 Link 跳转到详情页看付款码。 */}
                  <span className="flex-1 py-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs text-center">
                    去付款
                  </span>
                </div>
              )}
              {order.status === 'delivering' && (
                <button onClick={(e) => { e.preventDefault(); confirmOrder(order.id) }} className="w-full mt-3 py-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs">确认收货</button>
              )}
            </Link>
          ))}

          {canLoadMore && (
            <button onClick={() => setPage(p => p + 1)} className="w-full py-2.5 rounded-full border border-warm-300 text-xs text-text-secondary">
              加载更多（已显示 {orders.length} / {total}）
            </button>
          )}
        </div>
      )}
    </div>
  )
}
