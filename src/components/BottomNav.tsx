'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from './CartProvider'

const TABS = [
  { href: '/', label: '主页', icon: '🏠', activeIcon: '🏠' },
  { href: '/cart', label: '购物车', icon: '🛒', activeIcon: '🛒' },
  { href: '/profile', label: '我的', icon: '👤', activeIcon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { totalCount } = useCart()

  // 不在管理后台、登录/注册、结算、商品详情、订单详情页显示
  if (pathname?.startsWith('/admin') || pathname === '/login' || pathname === '/register' ||
      pathname === '/checkout' || pathname?.startsWith('/products/') || pathname?.startsWith('/orders/')) {
    return null
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 z-50 pb-[env(safe-area-inset-bottom,0)]">
      <div className="max-w-lg mx-auto flex items-center justify-around h-14">
        {TABS.map(tab => {
          const isActive = pathname === tab.href || (tab.href !== '/' && pathname?.startsWith(tab.href))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] py-1 relative ${isActive ? 'text-primary-500' : 'text-text-light'}`}
            >
              <span className="text-xl leading-none relative">
                {tab.icon}
                {tab.href === '/cart' && totalCount > 0 && (
                  <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1">
                    {totalCount > 99 ? '99+' : totalCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && <span className="absolute -top-0.5 w-6 h-0.5 bg-primary-500 rounded-full" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
