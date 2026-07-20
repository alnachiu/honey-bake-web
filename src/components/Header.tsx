'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Header() {
  const { user, logout } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [shopName, setShopName] = useState('甜蜜烘焙')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.settings?.name) setShopName(data.settings.name)
    }).catch(() => {})
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-warm-200">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1">
          <span className="text-xl">🍪</span>
          <span className="font-bold text-text-primary text-lg">{shopName}</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/cart" className="text-xl relative">
            🛒
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
                    <Link href="/coupons" className="block px-4 py-2.5 text-sm text-text-primary hover:bg-warm-50" onClick={() => setShowMenu(false)}>🎫 优惠券</Link>
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
