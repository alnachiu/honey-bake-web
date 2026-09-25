'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { formatDate, getOrderStatusText } from '@/lib/utils'
import OrderStatusActions from '@/components/OrderStatusActions'

const STATUS_COLORS: Record<string, string> = { pending: '#E6A23C', paid: '#67C23A', making: '#409EFF', delivering: '#E8806A', completed: '#909399', cancelled: '#C0C4CC' }
const STATUS_ICONS: Record<string, string> = { pending: '⏳', paid: '👩‍🍳', making: '👨‍🍳', delivering: '🚚', completed: '✅', cancelled: '❌' }

const STATUS_DESC: Record<string, string> = { pending: '请扫码付款后点下方「已扫码支付」', paid: '店主正在精心准备您的订单', making: '正在制作中，请耐心等待', delivering: '您的订单正在配送中', completed: '感谢您的购买~', cancelled: '订单已取消' }

// 店主在这几种状态下有可做的动作（与 OrderStatusActions 支持的状态保持一致）
const ADMIN_ACTION_STATUSES = ['pending', 'paid', 'making', 'delivering']

export default function OrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paymentQR, setPaymentQR] = useState('')
  const [payNotifying, setPayNotifying] = useState(false)
  const [toast, setToast] = useState('')

  // 店主看的是别人的单：付款码、「已扫码支付」、取消/确认收货这些消费者动作
  // 对他都不成立（「已扫码支付」还会被服务端按归属 403），整体换成管理操作。
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    // 等认证恢复完再判，否则刷新时 user 还是 null，会被误踢去登录页
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchOrder()
  }, [id, user, authLoading])

  // 店主在后台改了状态，这里 10 秒内自己跟上，不用用户手动刷新
  useAutoRefresh(() => fetchOrder(true), 10000, !authLoading && !!user)

  const fetchOrder = async (silent = false) => {
    try {
      const [orderRes, settingsRes] = await Promise.all([
        fetch(`/api/orders/${id}`),
        fetch('/api/settings')
      ])
      const orderData = await orderRes.json()
      const settingsData = await settingsRes.json()
      setOrder(orderData.order)
      if (settingsData.settings?.paymentQR) setPaymentQR(settingsData.settings.paymentQR)
    } catch (err) { console.error(err) }
    // 轮询时不要动 loading：否则每 10 秒整页闪一次骨架屏
    if (!silent) setLoading(false)
  }

  const updateStatus = async (status: string) => {
    try {
      await fetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      fetchOrder()
    } catch (err) { console.error(err) }
  }

  /** 「已扫码支付」：只是告诉店主「我已经转账了」，真正的收款确认在后台。
   *  不能像以前那样直接把订单置为 paid——那个请求会被服务端 403 挡掉
   *  （非管理员不得确认付款），点了等于没反应。 */
  const claimPaid = async () => {
    if (payNotifying) return
    setPayNotifying(true)
    try {
      const res = await fetch(`/api/orders/${id}/pay-notify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setToast(data.error || '通知店主失败，请重试')
      } else {
        setToast(data.alreadyNotified ? '已通知过店主了，请耐心等待' : '✅ 已通知店主，等待确认收款')
        fetchOrder(true)   // 立刻把 payClaimedAt 反映到按钮状态上
      }
    } catch (err) {
      setToast('网络异常，请重试')
    }
    setPayNotifying(false)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) return <div className="page-container pt-4"><div className="h-24 skeleton rounded-2xl mb-4" /><div className="h-32 skeleton rounded-2xl mb-4" /><div className="h-40 skeleton rounded-2xl" /></div>
  if (!order) return <div className="page-container pt-20 text-center"><p className="text-text-light">订单不存在</p><Link href="/orders" className="text-primary-500 text-sm mt-2 block">返回订单列表</Link></div>

  const statusColor = STATUS_COLORS[order.status] || '#909399'
  const statusIcon = STATUS_ICONS[order.status] || '📋'

  return (
    <div className="pb-28">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

      {/* Status Bar */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl p-5 text-white" style={{ background: statusColor }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{statusIcon}</span>
            <div>
              <p className="font-semibold text-lg">{getOrderStatusText(order.status)}</p>
              {/* 那句「请扫码付款后点已扫码支付」是给消费者的，店主看到只会困惑 */}
              <p className="text-sm opacity-90 mt-0.5">
                {isAdmin ? `订单 #${order.orderNo?.slice(-8)}` : STATUS_DESC[order.status]}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment QR Code（消费者专用：店主不替顾客扫码付款） */}
      {!isAdmin && order.status === 'pending' && paymentQR && (
        <div className="px-4 mt-3">
          <div className="card flex flex-col items-center py-5">
            <p className="text-sm font-medium text-text-primary mb-1">💳 微信扫码付款</p>
            <p className="text-xs text-text-light mb-4">保存二维码到微信扫码支付，付完点下方「已扫码支付」告知店主</p>
            <div className="w-44 h-44 bg-white rounded-xl p-2 border border-warm-200 shadow-sm">
              <img src={paymentQR} alt="微信收款码" className="w-full h-full object-contain" />
            </div>
            <p className="text-xs text-text-light mt-3">金额：<span className="text-primary-500 font-semibold text-sm">¥{order.totalAmount.toFixed(2)}</span></p>
            {order.payClaimedAt && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 mt-3">
                已于 {formatDate(order.payClaimedAt)} 告知店主，等待确认收款
              </p>
            )}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="px-4 mt-3">
        <div className="card">
          <p className="text-sm font-medium mb-3">商品清单</p>
          {order.items?.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
              <img src={item.image || '/placeholder.jpg'} className="w-14 h-14 rounded-xl bg-warm-100 object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{item.name}</p>
                <p className="text-xs text-text-light">¥{item.price} x {item.quantity}</p>
              </div>
              <p className="text-sm text-text-primary">¥{(item.price * item.quantity).toFixed(2)}</p>
            </div>
          ))}
          {/* 买赠券带来的赠品：不关联商品、不计金额，只随单配送 */}
          {order.giftName && order.giftQuantity > 0 && (
            <div className="flex items-center gap-3 pt-3 border-t border-warm-100">
              <div className="w-14 h-14 rounded-xl bg-primary-50 flex items-center justify-center text-xl flex-shrink-0">🎁</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  {order.giftName}
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-500">赠品</span>
                </p>
                <p className="text-xs text-text-light">x{order.giftQuantity} · 随单配送</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Info */}
      <div className="px-4 mt-3">
        <div className="card space-y-2">
          {order.address && (
            <div className="pb-2 border-b border-warm-100 mb-2">
              <p className="text-xs text-text-light mb-1">收货地址</p>
              <p className="text-sm font-medium">{order.address.name} {order.address.phone}</p>
              <p className="text-xs text-text-secondary">{order.address.region} {order.address.detail}</p>
            </div>
          )}
          {/* 付款码那块对店主是隐藏的，所以「顾客说付了」这条必须在这里露出，
              否则店主判断不了该不该点确认收款 */}
          {isAdmin && order.payClaimedAt && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-1">
              顾客已于 {formatDate(order.payClaimedAt)} 告知已付款
            </p>
          )}
          <div className="flex justify-between text-xs"><span className="text-text-light">订单编号</span><span className="text-text-primary">{order.orderNo}</span></div>
          <div className="flex justify-between text-xs"><span className="text-text-light">下单时间</span><span className="text-text-primary">{formatDate(order.createdAt)}</span></div>
          {order.payTime && <div className="flex justify-between text-xs"><span className="text-text-light">付款时间</span><span className="text-text-primary">{formatDate(order.payTime)}</span></div>}
          {order.trackingNo && (
            <div className="flex justify-between text-xs">
              <span className="text-text-light">📦 物流单号</span>
              <span className="text-blue-500 font-medium">{order.trackingNo}</span>
            </div>
          )}
          {order.remark && <div className="flex justify-between text-xs"><span className="text-text-light">备注</span><span className="text-text-primary">{order.remark}</span></div>}
          <div className="border-t border-warm-100 pt-2 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-text-light">商品金额</span><span>¥{order.itemsAmount?.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-text-light">运费</span><span>{order.deliveryFee > 0 ? `¥${order.deliveryFee.toFixed(2)}` : '免运费'}</span></div>
            {order.couponDiscount > 0 && <div className="flex justify-between text-xs"><span className="text-text-light">优惠券</span><span className="text-primary-500">-¥{order.couponDiscount.toFixed(2)}</span></div>}
            {order.memberDiscount > 0 && <div className="flex justify-between text-xs"><span className="text-text-light">💎 会员折扣</span><span className="text-primary-500">-¥{order.memberDiscount.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm font-semibold pt-1"><span>实付金额</span><span className="text-primary-500">¥{order.totalAmount.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(!isAdmin || ADMIN_ACTION_STATUSES.includes(order.status)) && (
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-3">
          {isAdmin ? (
            // 店主的操作集：确认收款 / 发货 / 完成配送，与订单管理列表里的是同一个组件。
            // 已完成/已取消的单没有可做动作，那时整条底栏都不渲染——否则页脚挂一条
            // 空白栏，看着像加载失败。
            <OrderStatusActions order={order} onDone={() => fetchOrder(true)} size="full" />
          ) : (
            <>
              {order.status === 'pending' && (
                <>
                  <button onClick={() => updateStatus('cancelled')} className="flex-1 py-2.5 rounded-full border border-warm-300 text-sm text-text-secondary">取消订单</button>
                  {order.payClaimedAt ? (
                    // 已经声明过付款就置灰：重复点只会重复通知店主，没有意义
                    <button disabled className="flex-1 py-2.5 rounded-full bg-warm-200 text-text-light text-sm">
                      已扫码支付 ¥{order.totalAmount.toFixed(2)}
                    </button>
                  ) : (
                    <button onClick={claimPaid} disabled={payNotifying} className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm disabled:opacity-60">
                      {payNotifying ? '通知中...' : `已扫码支付 ¥${order.totalAmount.toFixed(2)}`}
                    </button>
                  )}
                </>
              )}
              {order.status === 'delivering' && (
                <button onClick={() => updateStatus('completed')} className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm">确认收货</button>
              )}
              {order.status === 'completed' && (
                <Link href="/" className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm text-center">再来一单</Link>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
