'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const TABS = ['全部', '待付款', '待制作', '配送中', '已完成']
const STATUS_MAP: Record<string, string> = { '全部': '', '待付款': 'pending', '待制作': 'paid', '配送中': 'delivering', '已完成': 'completed' }

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('全部')

  useEffect(() => {
    // 必须等认证恢复完再判：user 初值就是 null，抢先判会把
    // 带着有效 cookie 的已登录用户直接踢到登录页（刷新即掉登录的根因）。
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchOrders()
  }, [user, authLoading, tab])

  // 店主改状态后这里要自己变，不用用户手动下拉刷新
  useAutoRefresh(() => fetchOrders(true), 15000, !!user)

  const fetchOrders = async (silent = false) => {
    // 轮询走 silent：不能每次 setLoading(true)，否则列表每 15 秒闪一遍骨架屏
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      const status = STATUS_MAP[tab]
      if (status) params.set('status', status)
      const res = await fetch(`/api/orders?${params}`)
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (err) { console.error(err) }
    if (!silent) setLoading(false)
  }

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

  const getStatusText = (s: string) => ({ pending: '待付款', paid: '待制作', making: '制作中', delivering: '配送中', completed: '已完成', cancelled: '已取消' }[s] || s)
  const getStatusColor = (s: string) => ({ pending: 'text-yellow-500', paid: 'text-green-500', making: 'text-blue-500', delivering: 'text-primary-500', completed: 'text-text-light', cancelled: 'text-text-light' }[s] || '')

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

  return (
    <div className="page-container pt-4">
      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card"><div className="h-4 skeleton w-1/3 mb-3" /><div className="h-3 skeleton w-full mb-2" /><div className="h-3 skeleton w-2/3" /></div>)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-text-light">暂无订单</p>
          <Link href="/" className="btn-primary inline-block mt-4 text-sm">去逛逛</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <Link key={order.id} href={`/orders/${order.id}`} className="card block">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-text-light">#{order.orderNo?.slice(-8)}</span>
                <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span>
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
        </div>
      )}
    </div>
  )
}
