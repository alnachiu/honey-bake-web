'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!loading) {
      if (!user) router.push('/login')
      else if (user.role !== 'admin') router.push('/')
      else setChecking(false)
    }
  }, [user, loading])

  // 后台此前完全没有消息入口，消费者点「已扫码支付 / 我已付款」发来的待办
  // 店主根本看不到——第 2、6 项等于没生效。这里放入口 + 未读角标。
  const fetchUnread = () => {
    if (!user) { setUnreadCount(0); return }
    fetch('/api/notifications?limit=1')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setUnreadCount(data.unreadCount || 0) })
      .catch(() => {})
  }

  useEffect(() => { fetchUnread() }, [user])
  // 30 秒轮询 + 切回前台补一次，新订单/收款待办能自己冒出来
  useAutoRefresh(fetchUnread, 30000, user?.role === 'admin')

  if (loading || checking) return <div className="page-container pt-20 text-center"><div className="animate-spin text-3xl mb-4">⏳</div><p className="text-text-light">验证权限...</p></div>

  return (
    <div>
      {/* Admin Nav */}
      <div className="bg-white border-b border-warm-200 sticky top-14 z-40">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide py-2">
            <Link href="/admin" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📊 概览</Link>
            {/* 放在最前面紧挨概览：收款待办是店主最高频要处理的事 */}
            <Link href="/messages" className="relative text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">
              🔔 消息
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link href="/admin/products" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📦 商品</Link>
            <Link href="/admin/orders" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📋 订单</Link>
            <Link href="/admin/coupons" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">🎫 优惠券</Link>
            <Link href="/admin/membership" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">💎 会员卡</Link>
            <Link href="/admin/layout" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">🎨 排版</Link>
            <Link href="/admin/share" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📱 分享</Link>
            <Link href="/admin/settings" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">⚙️ 设置</Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
