'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function CouponsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [coupons, setCoupons] = useState<any[]>([])
  const [myCouponIds, setMyCouponIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchCoupons()
    fetchMyCoupons()
  }, [user])

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const fetchMyCoupons = async () => {
    try {
      const res = await fetch('/api/coupons/claim')
      const data = await res.json()
      setMyCouponIds((data.coupons || []).map((c: any) => c.id))
    } catch (err) { console.error(err) }
  }

  const claimCoupon = async (couponId: string) => {
    try {
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponId })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('🎉 领取成功！')
        fetchMyCoupons()
      } else {
        setMessage(data.error || '领取失败')
      }
    } catch (err) {
      setMessage('领取失败')
    }
    setTimeout(() => setMessage(''), 2000)
  }

  const isClaimed = (id: string) => myCouponIds.includes(id)

  if (!user) return null

  return (
    <div className="page-container pt-4 animate-fade-in">
      <h1 className="text-lg font-bold text-text-primary mb-1">🎫 优惠券中心</h1>
      <p className="text-sm text-text-light mb-4">领取优惠券，下单时享受更多优惠</p>

      {/* Toast */}
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎫</div>
          <p className="text-text-light">暂无可用优惠券</p>
          <Link href="/" className="btn-primary inline-block mt-4 text-sm">去逛逛</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map(coupon => (
            <div key={coupon.id} className={`card flex items-stretch overflow-hidden ${isClaimed(coupon.id) ? 'opacity-60' : ''}`}>
              <div className="w-28 bg-gradient-to-b from-primary-50 to-primary-100 flex flex-col items-center justify-center -ml-4 -my-4 rounded-r-2xl relative">
                <div className="absolute -top-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
                <div className="absolute -bottom-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
                <span className="text-2xl font-bold text-primary-500">
                  {coupon.type === 'reduce' ? '¥' : ''}{coupon.value}{coupon.type === 'discount' ? '折' : ''}
                </span>
                <span className="text-[10px] text-text-light mt-0.5">{coupon.description}</span>
              </div>
              <div className="flex-1 pl-4 flex flex-col justify-center">
                <p className="text-sm font-semibold text-text-primary">{coupon.name}</p>
                <p className="text-xs text-text-light mt-1">有效期至 {coupon.endTime}</p>
                <div className="mt-2">
                  {isClaimed(coupon.id) ? (
                    <span className="text-xs text-text-light bg-warm-100 px-3 py-1 rounded-full">已领取</span>
                  ) : (
                    <button onClick={() => claimCoupon(coupon.id)} className="text-xs px-4 py-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">立即领取</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
