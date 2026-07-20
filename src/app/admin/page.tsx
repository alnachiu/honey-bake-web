'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard')
      const d = await res.json()
      if (d.todayOrders !== undefined) setData(d)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  if (loading) return <div className="page-container pt-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>

  const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  return (
    <div className="page-container pt-4 animate-fade-in">
      <h1 className="text-lg font-bold text-text-primary mb-4">📊 数据概览</h1>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-500">{data?.todayOrders || 0}</p>
          <p className="text-xs text-text-light mt-1">今日订单</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-500">¥{(data?.todayRevenue || 0).toFixed(2)}</p>
          <p className="text-xs text-text-light mt-1">今日收入</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-text-primary">{data?.totalProducts || 0}</p>
          <p className="text-xs text-text-light mt-1">商品总数</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-text-primary">{data?.totalUsers || 0}</p>
          <p className="text-xs text-text-light mt-1">累计用户</p>
        </div>
      </div>

      {/* Week Chart */}
      <div className="card mb-4">
        <p className="text-sm font-medium mb-4">📈 本周订单趋势</p>
        <div className="flex items-end justify-between h-32">
          {(data?.weekOrders || []).map((v: number, i: number) => (
            <div key={i} className="flex flex-col items-center flex-1 h-full justify-end">
              <span className="text-[10px] text-text-light mb-1">{v}</span>
              <div className="w-6 rounded-t-lg bg-gradient-to-t from-primary-400 to-primary-500 transition-all duration-500" style={{ height: `${Math.max(8, v * 20)}px` }} />
              <span className="text-[10px] text-text-light mt-1.5">{weekDays[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/admin/products" className="card text-center py-5">
          <p className="text-2xl mb-1">📦</p>
          <p className="text-xs text-text-secondary">商品管理</p>
        </Link>
        <Link href="/admin/orders" className="card text-center py-5">
          <p className="text-2xl mb-1">📋</p>
          <p className="text-xs text-text-secondary">订单管理</p>
        </Link>
        <Link href="/admin/coupons" className="card text-center py-5">
          <p className="text-2xl mb-1">🎫</p>
          <p className="text-xs text-text-secondary">优惠券管理</p>
        </Link>
      </div>

      {data?.pendingOrdersCount > 0 && (
        <Link href="/admin/orders" className="card mt-3 flex items-center gap-3 bg-yellow-50 border-yellow-200">
          <span className="text-xl">⚠️</span>
          <span className="text-sm flex-1">有 {data.pendingOrdersCount} 个待处理订单</span>
          <span className="text-text-light text-sm">›</span>
        </Link>
      )}
    </div>
  )
}
