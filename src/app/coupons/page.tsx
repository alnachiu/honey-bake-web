'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { couponExpireText, couponAmountLabel, couponValueText, claimLimitHint, formatDate } from '@/lib/utils'

type TabKey = 'wallet' | 'center'

/**
 * 券包里的到期说明。
 *
 * 优先用 UserCoupon.expireTime（relative 模式的券在领取那一刻就把「N 天」落成了
 * 具体时刻，这张券的真正死线是它）；没有才退回券模板的有效期文案（fixed 模式）。
 */
function walletExpireText(uc: any): string {
  if (uc.expireTime) return `有效期至 ${formatDate(uc.expireTime)}`
  if (uc.validMode === 'relative') return `领取后 ${uc.validDays || 0} 天内有效`
  return couponExpireText(uc)
}

/** 券包里那张券此刻的状态文案与配色，可用性判定完全来自服务端的 usable */
function walletState(uc: any): { text: string; cls: string } {
  if (uc.usable) return { text: '可用', cls: 'bg-primary-50 text-primary-500' }
  if (uc.status === 'used') return { text: '已使用', cls: 'bg-warm-100 text-text-light' }
  return { text: '已过期', cls: 'bg-warm-100 text-text-light' }
}

export default function CouponsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('wallet')

  // 券包（UserCoupon）
  const [wallet, setWallet] = useState<any[]>([])
  const [walletLoading, setWalletLoading] = useState(true)

  // 领券中心（券模板）
  const [coupons, setCoupons] = useState<any[]>([])
  const [centerLoading, setCenterLoading] = useState(true)

  const [message, setMessage] = useState('')
  const [claimingId, setClaimingId] = useState('')

  // 读 ?tab=。
  // 刻意不用 useSearchParams：项目里没有 <Suspense> 边界，
  // App Router 预渲染客户端页面时会报 missing-suspense-with-csr-bailout。
  // 默认就是券包（用户从消息中心点「收到一张会员专属优惠券」过来时，
  // 要落在他能看见那张券的地方，而不是一个只会告诉他「暂无可用优惠券」的领券中心）。
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'center' || t === 'wallet') setTab(t)
  }, [])

  useEffect(() => {
    // 等认证恢复完再判：user 初值为 null，抢先判会把刷新页面的用户踢去登录页
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchCenter()
  }, [user, authLoading])

  // 券包按需拉取：切到券包时才请求，回来时重拉一次（可能刚下完单用掉了一张）
  useEffect(() => {
    if (authLoading || !user) return
    if (tab !== 'wallet') return
    fetchWallet()
  }, [tab, user, authLoading])

  const fetchWallet = async () => {
    setWalletLoading(true)
    try {
      const res = await fetch('/api/coupons/claim')
      const data = await res.json()
      setWallet(data.coupons || [])
    } catch (err) { console.error(err) }
    setWalletLoading(false)
  }

  const fetchCenter = async () => {
    setCenterLoading(true)
    try {
      const res = await fetch('/api/coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
    setCenterLoading(false)
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
        setMessage('🎉 领取成功！已放入券包')
        await Promise.all([fetchCenter(), fetchWallet()])
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

  // 可用的排前面，已用/过期沉到底部并置灰
  const usableCoupons = wallet.filter(c => c.usable)
  const deadCoupons = wallet.filter(c => !c.usable)

  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="h-8 skeleton w-1/2" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}
      </div>
    )
  }
  if (!user) return null

  /** 一张券卡片的左半边（金额块），券包与领券中心共用同一套视觉 */
  const couponStub = (c: any) => (
    <div className="w-28 bg-gradient-to-b from-primary-50 to-primary-100 flex flex-col items-center justify-center -ml-4 -my-4 rounded-r-2xl relative">
      <div className="absolute -top-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
      <div className="absolute -bottom-2 right-0 w-4 h-4 bg-[#FFFCF9] rounded-full" />
      <span className="text-2xl font-bold text-primary-500">{couponAmountLabel(c)}</span>
      <span className="text-[10px] text-text-light mt-0.5 text-center px-1">{c.description}</span>
    </div>
  )

  const renderWallet = () => {
    if (walletLoading) {
      return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
    }
    if (!wallet.length) {
      return (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎫</div>
          <p className="text-text-light">券包还是空的</p>
          <button onClick={() => setTab('center')} className="btn-primary inline-block mt-4 text-sm">去领券中心看看</button>
        </div>
      )
    }

    const card = (uc: any, dead: boolean) => {
      const st = walletState(uc)
      return (
        <div key={uc.userCouponId} className={`card flex items-stretch overflow-hidden ${dead ? 'opacity-60' : ''}`}>
          {couponStub(uc)}
          <div className="flex-1 pl-4 flex flex-col justify-center">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-text-primary truncate">{uc.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}>{st.text}</span>
            </div>
            <p className="text-xs text-text-light mt-1">{walletExpireText(uc)}</p>

            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {/* source=push 就是店主推送/会员卡开通时发的，标出来让会员知道这是权益 */}
              {uc.source === 'push' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">💎 会员专属</span>
              )}
              {uc.type === 'gift' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-500">
                  🎁 {couponValueText(uc)}
                </span>
              )}
              {uc.stackable && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">可叠加</span>
              )}
            </div>

            <div className="mt-2">
              {uc.usable ? (
                <Link href="/cart" className="inline-block text-xs px-4 py-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">
                  去使用
                </Link>
              ) : (
                <span className="text-[10px] text-text-light">
                  {uc.status === 'used' && uc.useTime ? `使用于 ${formatDate(uc.useTime)}` : '该券已不可用'}
                </span>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {usableCoupons.length > 0 && (
          <>
            <p className="text-xs text-text-light">可用（{usableCoupons.length}）</p>
            {usableCoupons.map(c => card(c, false))}
          </>
        )}
        {deadCoupons.length > 0 && (
          <>
            <p className="text-xs text-text-light pt-2">已使用 / 已过期（{deadCoupons.length}）</p>
            {deadCoupons.map(c => card(c, true))}
          </>
        )}
      </div>
    )
  }

  const renderCenter = () => {
    if (centerLoading) {
      return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
    }
    if (!coupons.length) {
      return (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎫</div>
          <p className="text-text-light">暂无可用优惠券</p>
          <Link href="/" className="btn-primary inline-block mt-4 text-sm">去逛逛</Link>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {coupons.map(coupon => (
          <div key={coupon.id} className={`card flex items-stretch overflow-hidden ${isExhausted(coupon) ? 'opacity-60' : ''}`}>
            {couponStub(coupon)}
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
    )
  }

  return (
    <div className="page-container pt-4 animate-fade-in">
      <h1 className="text-lg font-bold text-text-primary mb-1">🎫 优惠券</h1>
      <p className="text-sm text-text-light mb-3">
        {tab === 'wallet' ? '这里是你已经拿到的券，下单时可选用' : '领取优惠券，下单时享受更多优惠'}
      </p>

      {/* Toast */}
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      <div className="flex mb-4 bg-warm-100 rounded-xl p-1">
        {([
          { key: 'wallet' as TabKey, label: '🎫 我的券包' },
          { key: 'center' as TabKey, label: '🏪 领券中心' }
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              tab === t.key ? 'bg-white text-text-primary font-medium shadow-sm' : 'text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wallet' ? renderWallet() : renderCenter()}
    </div>
  )
}
