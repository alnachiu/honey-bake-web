'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isMemberActive } from '@/lib/utils'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

export default function Header() {
  const { user, logout } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [shopName, setShopName] = useState('甜蜜烘焙')
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()

  const isMember = isMemberActive(user?.memberExpire)
  // 管理员只管理网站与导单，不显示购物车入口
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.settings?.name) setShopName(data.settings.name)
    }).catch(() => {})
  }, [])

  // 未登录时接口返回 401，静默忽略即可
  const fetchUnread = () => {
    if (!user) { setUnreadCount(0); return }
    fetch('/api/notifications?limit=1')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setUnreadCount(data.unreadCount || 0) })
      .catch(() => {})
  }

  useEffect(() => { fetchUnread() }, [user])

  // 之前只在 user 变化时取一次，于是「店主在后台确认收款 / 收到新订单」这类
  // 角标要等用户手动刷新页面才出现。改成 30 秒轮询 + 切回前台立刻补一次。
  useAutoRefresh(fetchUnread, 30000, !!user)

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-warm-200">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-xl">🍪</span>
          <span className="font-bold text-text-primary text-lg">{shopName}</span>
        </Link>

        <div className="flex items-center gap-3">
          {!isAdmin && (
            <Link href="/cart" className="text-xl relative">
              🛒
            </Link>
          )}
          {/* 会员卡入口不走购物车，直接进购买页 */}
          <Link href="/member" className="text-xl relative">
            💎
            {isMember && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] leading-none text-primary-500 font-medium whitespace-nowrap">会员</span>
            )}
          </Link>
          {user ? (
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="w-8 h-8 rounded-full overflow-hidden border-2 border-primary-200">
                <img src={user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(user.name || 'user')}&backgroundColor=fff0e8`} alt={user.name} className="w-full h-full object-cover" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-10 z-20 bg-white rounded-xl shadow-lg border border-warm-200 py-2 min-w-[160px] animate-fade-in">
                    <div className="px-4 py-2 border-b border-warm-100">
                      <p className="text-sm font-medium text-text-primary">{user.name}</p>
                      <p className="text-xs text-text-light">{user.email}</p>
                    </div>
                    <Link href="/orders" className="block px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>我的订单</Link>
                    <Link href="/member" className="flex items-center px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>
                      <span className="flex-1">💎 会员卡</span>
                      {isMember && <span className="text-[10px] text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded-full">已开通</span>}
                    </Link>
                    <Link href="/coupons" className="block px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>🎫 优惠券</Link>
                    <Link href="/messages" className="flex items-center px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>
                      <span className="flex-1">🔔 消息中心</span>
                      {unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                    <Link href="/profile" className="block px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>个人中心</Link>
                    {user.role === 'admin' && (
                      <>
                        <div className="border-t border-warm-100 my-1" />
                        <Link href="/admin" className="block px-4 py-2.5 text-sm text-primary-500 font-medium hover:bg-warm-50" onClick={() => setShowMenu(false)}>📊 管理后台</Link>
                        <Link href="/admin/settings" className="block px-4 py-2.5 text-sm text-primary-500 font-medium hover:bg-warm-50" onClick={() => setShowMenu(false)}>⚙️ 店铺设置</Link>
                      </>
                    )}
                    <div className="border-t border-warm-100 mt-1 pt-1">
                      <button onClick={() => { setShowMenu(false); logout() }} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-warm-50">退出登录</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="text-sm text-primary-500 font-medium">登录</Link>
          )}
        </div>
      </div>
    </header>
  )
}
