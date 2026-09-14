'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { couponExpireText, couponAmountLabel, couponValueText, claimLimitHint } from '@/lib/utils'

export default function CouponsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [claimingId, setClaimingId] = useState('')

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchCoupons()
  }, [user])

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const claimCoupon = async (couponId: string) => {
    setClaimingId(couponId)
    try {
      const res = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponId })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessage('🎉 领取成功！')
        await fetchCoupons()
      } else {
        setMessage(data.error || '领取失败')
      }
    } catch (err) {
      setMessage('领取失败')
    }
    setClaimingId('')
    setTimeout(() => setMessage(''), 2000)
  }

  // 剩余可领张数、是否触限、触限原因都由服务端按三条限领规则算好带下来
  // （见 api/coupons 里的 evaluateClaimLimits），前端不再自己算一遍，
  // 免得两边的规则悄悄漂移——上一版这里只认 perUserLimit 一条。
  const isExhausted = (c: any) => c.soldOut || c.reachedLimit

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
            <div key={coupon.id} className={`card flex items-stretch overflow-hidden ${isExhausted(coupon) ? 'opacity-60' : ''}`}>
              <div className="w-28 bg-gradient-to-b from-primary-50 to-primary-100 flex flex-col items-center justify-center -ml-4 -my-4 rounded-r-2xl relative">
                <div className="absolute -top-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
                <div className="absolute -bottom-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
                <span className="text-2xl font-bold text-primary-500">{couponAmountLabel(coupon)}</span>
                <span className="text-[10px] text-text-light mt-0.5 text-center px-1">{coupon.description}</span>
              </div>
              <div className="flex-1 pl-4 flex flex-col justify-center">
                <p className="text-sm font-semibold text-text-primary">{coupon.name}</p>
                <p className="text-xs text-text-light mt-1">{couponExpireText(coupon)}</p>

                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {coupon.type === 'gift' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-500">
                      🎁 {couponValueText(coupon)}
                    </span>
                  )}
                  {coupon.stackable && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">可叠加</span>
                  )}
                  {/* 三条限领规则里启用了哪几条，一次拼好给用户看 */}
                  {claimLimitHint(coupon) && (
                    <span className="text-[10px] text-text-light">{claimLimitHint(coupon)}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {coupon.soldOut ? (
                    <span className="text-xs text-text-light bg-warm-100 px-3 py-1 rounded-full">已领完</span>
                  ) : coupon.reachedLimit ? (
                    <span className="text-xs text-text-light">{coupon.limitReason || '已达领取上限'}</span>
                  ) : (
                    <>
                      <button
                        onClick={() => claimCoupon(coupon.id)}
                        disabled={claimingId === coupon.id}
                        className="text-xs px-4 py-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white disabled:opacity-60"
                      >
                        {claimingId === coupon.id ? '领取中...' : coupon.myClaimCount > 0 ? '再领一张' : '立即领取'}
                      </button>
                      {coupon.myClaimCount > 0 && (
                        <span className="text-[10px] text-text-light">
                          已领 {coupon.myClaimCount}
                          {coupon.remainForMe > 0 ? ` · 还可领 ${coupon.remainForMe} 张` : ''}
                        </span>
                      )}
                    </>
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
