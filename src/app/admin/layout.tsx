'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!loading) {
      if (!user) router.push('/login')
      else if (user.role !== 'admin') router.push('/')
      else setChecking(false)
    }
  }, [user, loading])

  if (loading || checking) return <div className="page-container pt-20 text-center"><div className="animate-spin text-3xl mb-4">⏳</div><p className="text-text-light">验证权限...</p></div>

  return (
    <div>
      {/* Admin Nav */}
      <div className="bg-white border-b border-warm-200 sticky top-14 z-40">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide py-2">
            <Link href="/admin" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📊 概览</Link>
            <Link href="/admin/products" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📦 商品</Link>
            <Link href="/admin/orders" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">📋 订单</Link>
            <Link href="/admin/coupons" className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-warm-100 text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors">🎫 优惠券</Link>
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
