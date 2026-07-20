'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, getOrderStatusText } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = { pending: '#E6A23C', paid: '#67C23A', making: '#409EFF', delivering: '#E8806A', completed: '#909399', cancelled: '#C0C4CC' }
const STATUS_ICONS: Record<string, string> = { pending: '⏳', paid: '👩‍🍳', making: '👨‍🍳', delivering: '🚚', completed: '✅', cancelled: '❌' }

const STATUS_DESC: Record<string, string> = { pending: '请在30分钟内完成支付', paid: '店主正在精心准备您的订单', making: '正在制作中，请耐心等待', delivering: '您的订单正在配送中', completed: '感谢您的购买~', cancelled: '订单已取消' }

export default function OrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paymentQR, setPaymentQR] = useState('')

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchOrder()
  }, [id, user])

  const fetchOrder = async () => {
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
    setLoading(false)
  }

  const updateStatus = async (status: string) => {
    try {
      await fetch(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      fetchOrder()
    } catch (err) { console.error(err) }
  }

  if (loading) return <div className="page-container pt-4"><div className="h-24 skeleton rounded-2xl mb-4" /><div className="h-32 skeleton rounded-2xl mb-4" /><div className="h-40 skeleton rounded-2xl" /></div>
  if (!order) return <div className="page-container pt-20 text-center"><p className="text-text-light">订单不存在</p><Link href="/orders" className="text-primary-500 text-sm mt-2 block">返回订单列表</Link></div>

  const statusColor = STATUS_COLORS[order.status] || '#909399'
  const statusIcon = STATUS_ICONS[order.status] || '📋'

  return (
    <div className="pb-28">
      {/* Status Bar */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl p-5 text-white" style={{ background: statusColor }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{statusIcon}</span>
            <div>
              <p className="font-semibold text-lg">{getOrderStatusText(order.status)}</p>
              <p className="text-sm opacity-90 mt-0.5">{STATUS_DESC[order.status]}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment QR Code */}
      {order.status === 'pending' && paymentQR && (
        <div className="px-4 mt-3">
          <div className="card flex flex-col items-center py-5">
            <p className="text-sm font-medium text-text-primary mb-1">💳 微信扫码付款</p>
            <p className="text-xs text-text-light mb-4">保存二维码到微信扫码支付，支付后联系店主确认</p>
            <div className="w-44 h-44 bg-white rounded-xl p-2 border border-warm-200 shadow-sm">
              <img src={paymentQR} alt="微信收款码" className="w-full h-full object-contain" />
            </div>
            <p className="text-xs text-text-light mt-3">金额：<span className="text-primary-500 font-semibold text-sm">¥{order.totalAmount.toFixed(2)}</span></p>
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
            <div className="flex justify-between text-xs"><span className="text-text-light">配送费</span><span>{order.deliveryFee > 0 ? `¥${order.deliveryFee.toFixed(2)}` : '免运费'}</span></div>
            {order.couponDiscount > 0 && <div className="flex justify-between text-xs"><span className="text-text-light">优惠券</span><span className="text-primary-500">-¥{order.couponDiscount.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm font-semibold pt-1"><span>实付金额</span><span className="text-primary-500">¥{order.totalAmount.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-3">
          {order.status === 'pending' && (
            <>
              <button onClick={() => updateStatus('cancelled')} className="flex-1 py-2.5 rounded-full border border-warm-300 text-sm text-text-secondary">取消订单</button>
              <button onClick={() => updateStatus('paid')} className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm">去支付 ¥{order.totalAmount.toFixed(2)}</button>
            </>
          )}
          {order.status === 'delivering' && (
            <button onClick={() => updateStatus('completed')} className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm">确认收货</button>
          )}
          {order.status === 'completed' && (
            <Link href="/" className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-sm text-center">再来一单</Link>
          )}
        </div>
      </div>
    </div>
  )
}
