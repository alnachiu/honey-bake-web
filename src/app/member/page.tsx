'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, isMemberActive, isValidPhone, memberRemainDays } from '@/lib/utils'

const STATUS_TEXT: Record<string, string> = {
  pending: '待店主确认收款',
  paid: '已开通',
  cancelled: '已取消'
}

export default function MemberPage() {
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const [plans, setPlans] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [memberExpire, setMemberExpire] = useState<string | null>(null)
  const [memberRate, setMemberRate] = useState(1)
  const [paymentQR, setPaymentQR] = useState('')
  const [loading, setLoading] = useState(true)
  const [buyingId, setBuyingId] = useState('')
  const [payOrder, setPayOrder] = useState<any>(null)
  const [message, setMessage] = useState('')
  // 绑定手机号：手机号是会员卡的凭证，没绑定就不让开卡（服务端也会挡）
  const [showBindModal, setShowBindModal] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [bindError, setBindError] = useState('')
  const [binding, setBinding] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<any>(null)

  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchAll()
  }, [user])

  const fetchAll = async () => {
    try {
      const [plansRes, ordersRes, settingsRes] = await Promise.all([
        fetch('/api/membership/plans'),
        fetch('/api/membership/orders'),
        fetch('/api/settings')
      ])
      const plansData = await plansRes.json()
      const ordersData = await ordersRes.json()
      const settingsData = await settingsRes.json()

      setPlans(plansData.plans || [])
      setOrders(ordersData.orders || [])
      setMemberExpire(ordersData.memberExpire || null)
      if (settingsData.settings?.paymentQR) setPaymentQR(settingsData.settings.paymentQR)
      const rate = settingsData.settings?.memberDiscount
      if (Number.isFinite(rate) && rate > 0 && rate <= 1) setMemberRate(rate)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // 真正创建购买单。绑定流程也要直接调它，不能再走 buyPlan——
  // buyPlan 里的 phoneBound 是渲染时闭包捕获的旧值，绑完立刻回调会看到 false 又弹一次绑定框。
  const createOrder = async (plan: any) => {
    setBuyingId(plan.id)
    try {
      const res = await fetch('/api/membership/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id })
      })
      const data = await res.json()
      if (res.ok && data.order) {
        setPayOrder(data.order)
        await fetchAll()
      } else {
        setMessage(data.error || '下单失败')
      }
    } catch (err) {
      setMessage('下单失败，请稍后重试')
    }
    setBuyingId('')
    setTimeout(() => setMessage(''), 2500)
  }

  const buyPlan = (plan: any) => {
    // 会员卡以手机号为凭证，没绑定就先让绑，绑完自动继续这一单
    if (!phoneBound) {
      setPendingPlan(plan)
      setPhoneInput('')
      setBindError('')
      setShowBindModal(true)
      return
    }
    createOrder(plan)
  }

  const bindPhone = async () => {
    if (!isValidPhone(phoneInput)) { setBindError('请输入正确的手机号'); return }
    setBinding(true)
    setBindError('')
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput })
      })
      const data = await res.json()
      if (!res.ok) {
        setBindError(data.error || '绑定失败')
        setBinding(false)
        return
      }
      await refreshUser()
      setShowBindModal(false)
      setMessage('手机号绑定成功')
      setTimeout(() => setMessage(''), 2500)
      // 之前点了开通/续费的话，绑完接着下那一单
      if (pendingPlan) {
        const plan = pendingPlan
        setPendingPlan(null)
        createOrder(plan)
      }
    } catch (err) {
      setBindError('绑定失败，请稍后重试')
    }
    setBinding(false)
  }

  const isMember = isMemberActive(memberExpire)
  const remainDays = memberRemainDays(memberExpire)
  // 邮箱注册的账号 phone 是空字符串，旧数据里也可能是历史号码，所以统一走格式校验
  const phoneBound = isValidPhone(user?.phone)
  // 折扣率 0.95 → 显示「95 折」；用 round 避免 0.9*10=9.000000000000002 这种浮点毛刺
  const discountText = memberRate < 1 ? `${Math.round(memberRate * 100) / 10} 折` : ''
  const discountPercent = memberRate < 1 ? `${Math.round((1 - memberRate) * 100)}%` : ''

  if (!user) return null

  return (
    <div className="page-container pt-4 pb-24 animate-fade-in">
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {/* 会员状态卡 */}
      <div className={`rounded-2xl p-5 mb-4 text-white ${isMember ? 'bg-gradient-to-br from-[#2B2B38] via-[#3A3550] to-[#6B5B95]' : 'bg-gradient-to-br from-warm-400 to-warm-300'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">{isMember ? '💎 尊享会员' : '💎 尚未开通会员'}</p>
            {isMember ? (
              <>
                <p className="text-2xl font-bold mt-1">还剩 {remainDays} 天</p>
                <p className="text-xs opacity-80 mt-1">有效期至 {formatDate(memberExpire as string)}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold mt-1">开通即享专属优惠</p>
                <p className="text-xs opacity-80 mt-1">下单自动打折，还能收到店主专属券</p>
              </>
            )}
          </div>
          <span className="text-4xl opacity-90">💎</span>
        </div>

        {discountText && (
          <div className="mt-4 bg-white/15 rounded-xl px-3 py-2">
            <p className="text-xs">
              {isMember ? `当前享受全场 ${discountText}（立省 ${discountPercent}）` : `开通后全场 ${discountText}（立省 ${discountPercent}）`}
            </p>
          </div>
        )}

        <div className="mt-2 bg-white/15 rounded-xl px-3 py-2">
          <p className="text-xs">
            凭证手机号：{phoneBound ? user.phone : <span className="text-amber-200">未绑定</span>}
          </p>
        </div>
      </div>

      {/* 手机号绑定：会员卡以手机号为凭证 */}
      {!phoneBound && (
        <div className="card mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-text-primary">⚠️ 开通前请先绑定手机号</p>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            会员卡以手机号为凭证，凭该手机号下单即可享受会员折扣。未绑定手机号的会员卡无法被识别。
          </p>
          <button
            onClick={() => { setPendingPlan(null); setPhoneInput(''); setBindError(''); setShowBindModal(true) }}
            className="mt-3 text-xs px-4 py-2 rounded-full bg-primary-500 text-white"
          >
            去绑定手机号
          </button>
        </div>
      )}

      {/* 套餐列表 */}
      <h2 className="text-sm font-bold text-text-primary mb-2">选择会员卡</h2>
      {loading ? (
        <div className="space-y-3 mb-4">{[1,2].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
      ) : plans.length === 0 ? (
        <div className="card text-center py-8 mb-4">
          <p className="text-text-light text-sm">店主还没有上架会员卡</p>
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {plans.map(p => {
            const perDay = p.days > 0 ? p.price / p.days : 0
            return (
              <div key={p.id} className="card flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-light mt-0.5">有效期 {p.days} 天{perDay > 0 ? ` · 约 ¥${perDay.toFixed(2)}/天` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0 mr-1">
                  <p className="text-lg font-bold text-primary-500">¥{p.price.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => buyPlan(p)}
                  disabled={buyingId === p.id}
                  className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white disabled:opacity-60 flex-shrink-0"
                >
                  {buyingId === p.id ? '处理中...' : isMember ? '续费' : '立即开通'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 我的购买记录 */}
      {orders.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-text-primary mb-2">我的购买记录</h2>
          <div className="card divide-y divide-warm-100 mb-4">
            {orders.map(o => (
              <div key={o.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">{o.planName} <span className="text-xs text-text-light">×{o.days}天</span></p>
                  <p className="text-[10px] text-text-light mt-0.5">#{o.orderNo?.slice(-8)} · {formatDate(o.createdAt)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm text-primary-500 font-medium">¥{o.price.toFixed(2)}</p>
                  <p className={`text-[10px] mt-0.5 ${o.status === 'paid' ? 'text-green-500' : o.status === 'cancelled' ? 'text-text-light' : 'text-amber-500'}`}>
                    {STATUS_TEXT[o.status] || o.status}
                  </p>
                </div>
                {o.status === 'pending' && (
                  <button onClick={() => setPayOrder(o)} className="text-[10px] px-2.5 py-1 rounded-full bg-primary-500 text-white flex-shrink-0">去付款</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card text-xs text-text-light leading-relaxed">
        <p className="text-sm font-medium text-text-primary mb-1">会员权益说明</p>
        <p>① 下单自动享受会员折扣，与优惠券叠加使用</p>
        <p>② 店主推送的会员专属优惠券自动到账</p>
        <p>③ 付款后由店主确认收款，会员自动开通</p>
        <p>④ 会员卡以手机号为凭证，用该手机号登录后下单即享折扣</p>
      </div>

      {/* 绑定手机号弹窗 */}
      {showBindModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { setShowBindModal(false); setPendingPlan(null) }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">绑定手机号</h3>
              <button onClick={() => { setShowBindModal(false); setPendingPlan(null) }} className="text-text-light">✕</button>
            </div>
            <p className="text-xs text-text-light mb-3 leading-relaxed">
              {pendingPlan ? `开通「${pendingPlan.name}」前需要先绑定手机号，绑好后会自动继续。` : '会员卡以手机号为凭证，凭该手机号下单即可享受会员折扣。'}
            </p>
            <input
              type="tel"
              className="input-field text-sm"
              placeholder="请输入手机号"
              maxLength={11}
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
            />
            {bindError && <p className="text-xs text-red-500 mt-2">{bindError}</p>}
            <button onClick={bindPhone} disabled={binding} className="btn-primary w-full text-sm py-2 mt-4">
              {binding ? '绑定中...' : pendingPlan ? '绑定并继续' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 付款弹窗 */}
      {payOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPayOrder(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">扫码付款</h3>
              <button onClick={() => setPayOrder(null)} className="text-text-light">✕</button>
            </div>
            <p className="text-xs text-text-light mb-3">{payOrder.planName} · 有效期 {payOrder.days} 天</p>
            {paymentQR ? (
              <div className="flex flex-col items-center">
                <div className="w-44 h-44 bg-white rounded-xl p-2 border border-warm-200">
                  <img src={paymentQR} alt="微信收款码" className="w-full h-full object-contain" />
                </div>
                <p className="text-xs text-text-light mt-3">
                  金额：<span className="text-primary-500 font-semibold text-sm">¥{payOrder.price.toFixed(2)}</span>
                </p>
                <p className="text-[10px] text-text-light mt-2 text-center leading-relaxed">
                  付款后请联系店主确认，确认后会员自动开通
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-light py-6 text-center">店主还没有上传收款码，请直接联系店主付款</p>
            )}
            <button onClick={() => setPayOrder(null)} className="btn-primary w-full text-sm py-2 mt-4">我已付款</button>
          </div>
        </div>
      )}
    </div>
  )
}
