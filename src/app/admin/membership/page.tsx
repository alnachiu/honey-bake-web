'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDate, couponValidityText, isValidPhone } from '@/lib/utils'

const TABS = ['💳 套餐与折扣', '🎫 推送优惠券', '👥 会员数据', '📋 购买订单'] as const

const ORDER_STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: '待确认收款', cls: 'text-amber-500' },
  paid: { text: '已开通', cls: 'text-green-500' },
  cancelled: { text: '已取消', cls: 'text-text-light' }
}

export default function AdminMembershipPage() {
  const [tab, setTab] = useState<string>(TABS[0])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [plans, setPlans] = useState<any[]>([])
  const [planForm, setPlanForm] = useState({ name: '', price: '', days: '', sort: '0', active: true })
  const [editingPlanId, setEditingPlanId] = useState('')
  const [planSaving, setPlanSaving] = useState(false)

  // 折扣以「折」为单位展示，0.95 的存储值 = 9.5 折
  const [discountInput, setDiscountInput] = useState('10')
  const [discountSaving, setDiscountSaving] = useState(false)

  const [coupons, setCoupons] = useState<any[]>([])
  const [pushCoupon, setPushCoupon] = useState<any>(null)
  const [pushCount, setPushCount] = useState<number | null>(null)
  const [pushing, setPushing] = useState(false)

  const [members, setMembers] = useState<any[]>([])
  const [memberStat, setMemberStat] = useState({ activeCount: 0, totalCount: 0 })
  const [orders, setOrders] = useState<any[]>([])
  const [dealId, setDealId] = useState('')

  const toast = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchPlans(), fetchSettings(), fetchCoupons(), fetchMembers(), fetchOrders()])
    setLoading(false)
  }

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/membership/plans?all=true')
      const data = await res.json()
      setPlans(data.plans || [])
    } catch (err) { console.error(err) }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      const rate = data.settings?.memberDiscount
      if (Number.isFinite(rate) && rate > 0) setDiscountInput(String(Math.round(rate * 100) / 10))
    } catch (err) { console.error(err) }
  }

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons?all=true')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
  }

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/membership/members')
      const data = await res.json()
      setMembers(data.members || [])
      setMemberStat({ activeCount: data.activeCount || 0, totalCount: data.totalCount || 0 })
    } catch (err) { console.error(err) }
  }

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/membership/orders')
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (err) { console.error(err) }
  }

  const saveDiscount = async () => {
    const discount = parseFloat(discountInput)
    if (!Number.isFinite(discount) || discount <= 0 || discount > 10) {
      alert('折扣需在 0 到 10 之间，如 9.5 表示 95 折')
      return
    }
    setDiscountSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberDiscount: Math.round((discount / 10) * 10000) / 10000 })
      })
      const data = await res.json()
      if (res.ok) toast('会员折扣已保存')
      else alert(data.error || '保存失败')
    } catch (err) { alert('保存失败，请稍后重试') }
    setDiscountSaving(false)
  }

  const submitPlan = async () => {
    if (!planForm.name) { alert('请填写套餐名称'); return }
    setPlanSaving(true)
    try {
      const res = await fetch('/api/membership/plans', {
        method: editingPlanId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingPlanId ? { id: editingPlanId } : {}),
          name: planForm.name,
          price: parseFloat(planForm.price || '0'),
          days: parseInt(planForm.days || '0', 10),
          sort: parseInt(planForm.sort || '0', 10),
          active: planForm.active
        })
      })
      const data = await res.json()
      if (res.ok) {
        setPlanForm({ name: '', price: '', days: '', sort: '0', active: true })
        setEditingPlanId('')
        await fetchPlans()
        toast(editingPlanId ? '套餐已更新' : '套餐已创建')
      } else {
        alert(data.error || '保存失败')
      }
    } catch (err) { alert('保存失败，请稍后重试') }
    setPlanSaving(false)
  }

  const editPlan = (p: any) => {
    setEditingPlanId(p.id)
    setPlanForm({
      name: p.name,
      price: String(p.price),
      days: String(p.days),
      sort: String(p.sort || 0),
      active: p.active
    })
  }

  const deletePlan = async (p: any) => {
    if (!confirm(`确定删除套餐「${p.name}」吗？`)) return
    try {
      const res = await fetch('/api/membership/plans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchPlans()
        toast('已删除')
      } else {
        // 有购买记录时后端会拒绝，把原因原样告诉店主
        alert(data.error || '删除失败')
      }
    } catch (err) { alert('删除失败，请稍后重试') }
  }

  const openPush = async (coupon: any) => {
    setPushCoupon(coupon)
    setPushCount(null)
    try {
      const res = await fetch(`/api/coupons/${coupon.id}/push`)
      const data = await res.json()
      if (res.ok) setPushCount(data.memberCount ?? 0)
      else setPushCount(null)
    } catch (err) { setPushCount(null) }
  }

  const confirmPush = async () => {
    if (!pushCoupon) return
    setPushing(true)
    try {
      const res = await fetch(`/api/coupons/${pushCoupon.id}/push`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setPushCoupon(null)
        await Promise.all([fetchCoupons(), fetchMembers()])
        toast(data.sent > 0 ? `已推送给 ${data.sent} 位会员` : '当前没有在期会员')
      } else {
        alert(data.error || '推送失败')
      }
    } catch (err) { alert('推送失败，请稍后重试') }
    setPushing(false)
  }

  const dealOrder = async (order: any, action: 'confirm' | 'cancel') => {
    const tip = action === 'confirm'
      ? `确认已收到「${order.planName}」的 ¥${order.price.toFixed(2)}？\n确认后将为 ${order.user?.name || '该用户'} 开通/续期 ${order.days} 天。`
      : `确定取消 ${order.user?.name || '该用户'} 的「${order.planName}」购买单吗？`
    if (!confirm(tip)) return

    setDealId(order.id)
    try {
      const res = await fetch(`/api/membership/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, action })
      })
      const data = await res.json()
      if (res.ok) {
        await Promise.all([fetchOrders(), fetchMembers()])
        toast(action === 'confirm' ? '已确认收款并开通会员' : '订单已取消')
      } else {
        alert(data.error || '操作失败')
      }
    } catch (err) { alert('操作失败，请稍后重试') }
    setDealId('')
  }

  const adjustMember = async (m: any) => {
    const input = prompt(
      `调整「${m.name}」的会员到期时间\n当前：${m.memberExpire ? formatDate(m.memberExpire) : '非会员'}\n\n输入要延长的天数（可填负数），留空取消`,
      '30'
    )
    if (input === null) return
    const trimmed = input.trim()
    if (!trimmed) return
    const days = parseInt(trimmed, 10)
    if (!Number.isInteger(days) || days === 0) { alert('请输入非零整数天数'); return }

    try {
      const res = await fetch('/api/membership/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: m.id, addDays: days })
      })
      const data = await res.json()
      if (res.ok) {
        await fetchMembers()
        toast('已调整')
      } else {
        alert(data.error || '调整失败')
      }
    } catch (err) { alert('调整失败，请稍后重试') }
  }

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const paidCount = orders.filter(o => o.status === 'paid').length
  const paidAmount = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (o.price || 0), 0)

  if (loading) return <div className="page-container pt-4"><div className="h-48 skeleton rounded-2xl" /></div>

  return (
    <div className="page-container pt-4 pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">💎 会员卡设置</h1>

      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t ? 'bg-primary-500 text-white' : 'bg-warm-100 text-text-secondary'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ---------- 套餐与折扣 ---------- */}
      {tab === TABS[0] && (
        <div className="space-y-3">
          <div className="card">
            <p className="text-sm font-medium text-text-primary mb-1">会员折扣</p>
            <p className="text-[10px] text-text-light mb-3">
              会员下单自动打折，作用于优惠券之后的金额。填 10 表示不打折，9.5 表示 95 折。
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                className="input-field text-sm flex-1"
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
              />
              <span className="text-sm text-text-secondary flex-shrink-0">折</span>
              <button onClick={saveDiscount} disabled={discountSaving} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
                {discountSaving ? '保存中' : '保存'}
              </button>
            </div>
          </div>

          <div className="card">
            <p className="text-sm font-medium text-text-primary mb-3">{editingPlanId ? '编辑套餐' : '新增套餐'}</p>
            <div className="space-y-3">
              <input className="input-field text-sm" placeholder="套餐名称，如 年卡" value={planForm.name} onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" className="input-field text-sm" placeholder="价格（元）" value={planForm.price} onChange={e => setPlanForm(p => ({ ...p, price: e.target.value }))} />
                <input type="number" className="input-field text-sm" placeholder="有效天数" value={planForm.days} onChange={e => setPlanForm(p => ({ ...p, days: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3 items-center">
                <input type="number" className="input-field text-sm" placeholder="排序（越小越前）" value={planForm.sort} onChange={e => setPlanForm(p => ({ ...p, sort: e.target.value }))} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text-primary">上架</span>
                  <button
                    type="button"
                    onClick={() => setPlanForm(p => ({ ...p, active: !p.active }))}
                    className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${planForm.active ? 'bg-green-400' : 'bg-warm-400'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${planForm.active ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {editingPlanId && (
                  <button
                    onClick={() => { setEditingPlanId(''); setPlanForm({ name: '', price: '', days: '', sort: '0', active: true }) }}
                    className="flex-1 py-2 rounded-xl border border-warm-200 text-sm text-text-secondary"
                  >
                    取消编辑
                  </button>
                )}
                <button onClick={submitPlan} disabled={planSaving} className="btn-primary flex-1 text-sm py-2">
                  {planSaving ? '保存中...' : editingPlanId ? '保存修改' : '新增套餐'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {plans.length === 0 ? (
              <div className="text-center py-10"><p className="text-text-light text-sm">还没有会员卡套餐</p></div>
            ) : plans.map(p => (
              <div key={p.id} className="card flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{p.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.active ? 'bg-green-50 text-green-600' : 'bg-warm-100 text-text-light'}`}>
                      {p.active ? '上架中' : '已下架'}
                    </span>
                  </div>
                  <p className="text-xs text-text-light mt-0.5">¥{p.price.toFixed(2)} / {p.days} 天</p>
                  <p className="text-[10px] text-text-light mt-0.5">已售 {p.soldCount || 0} 张</p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => editPlan(p)} className="text-[10px] px-2.5 py-1 rounded-full border border-primary-200 text-primary-500">编辑</button>
                  <button onClick={() => deletePlan(p)} className="text-[10px] px-2.5 py-1 rounded-full border border-red-200 text-red-400">删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- 推送优惠券 ---------- */}
      {tab === TABS[1] && (
        <div className="space-y-3">
          <div className="card">
            <p className="text-sm font-medium text-text-primary mb-1">🎫 推送优惠券给会员</p>
            <p className="text-[10px] text-text-light leading-relaxed">
              券会直接进入会员的券包，并在消息中心留下一条未读通知。
              已持有同一张券的会员也会再收到一张，不受每人限领数量限制。
            </p>
            <Link href="/admin/coupons" className="inline-block mt-3 text-xs px-4 py-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 text-white">
              ＋ 新建优惠券
            </Link>
          </div>

          {coupons.length === 0 ? (
            <div className="text-center py-10"><p className="text-text-light text-sm">还没有优惠券，先去创建一张</p></div>
          ) : coupons.map(c => (
            <div key={c.id} className="card flex items-center gap-3">
              <div className="w-14 h-14 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-primary-500">
                  {c.type === 'reduce' ? '¥' : ''}{c.value}{c.type === 'discount' ? '折' : ''}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{c.name}</p>
                <p className="text-[10px] text-text-light mt-0.5">{couponValidityText(c)}</p>
                <p className="text-[10px] text-text-light mt-0.5">已领 {c.claimed}{c.stock > 0 ? ` / ${c.stock}` : ''}</p>
              </div>
              <button
                onClick={() => openPush(c)}
                className="text-xs px-3 py-2 rounded-full bg-primary-500 text-white flex-shrink-0"
              >
                推送
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 会员数据 ---------- */}
      {tab === TABS[2] && (
        <div className="space-y-3">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">在期会员</p>
                <p className="text-2xl font-bold text-primary-500 mt-1">{memberStat.activeCount}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-text-secondary">累计开通过</p>
                <p className="text-2xl font-bold text-text-primary mt-1">{memberStat.totalCount}</p>
              </div>
            </div>
            <p className="text-[10px] text-text-light mt-3 leading-relaxed">
              💡 会员卡以手机号为凭证：顾客绑定的手机号决定他能不能享受折扣，顾客在结算页填到会员手机号时会被提示先登录。
            </p>
          </div>

          {pendingOrders.length > 0 && (
            <>
              <p className="text-sm font-bold text-text-primary">待确认收款（{pendingOrders.length}）</p>
              {pendingOrders.map(o => (
                <div key={o.id} className="card">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{o.user?.name || '未知用户'}</p>
                      <p className="text-xs text-text-light mt-0.5">{o.user?.phone || o.user?.email || ''}</p>
                      <p className="text-[10px] text-text-light mt-0.5">
                        {o.planName} · {o.days} 天 · ¥{o.price.toFixed(2)} · {formatDate(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => dealOrder(o, 'confirm')}
                        disabled={dealId === o.id}
                        className="text-[10px] px-3 py-1.5 rounded-full bg-green-500 text-white disabled:opacity-50"
                      >
                        💰 确认收款
                      </button>
                      <button
                        onClick={() => dealOrder(o, 'cancel')}
                        disabled={dealId === o.id}
                        className="text-[10px] px-3 py-1.5 rounded-full border border-warm-200 text-text-secondary disabled:opacity-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <p className="text-sm font-bold text-text-primary">会员列表</p>
          {members.length === 0 ? (
            <div className="text-center py-10"><p className="text-text-light text-sm">还没有人开通会员</p></div>
          ) : members.map(m => (
            <div key={m.id} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{m.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.active ? 'bg-primary-50 text-primary-500' : 'bg-warm-100 text-text-light'}`}>
                    {m.active ? '会员' : '已过期'}
                  </span>
                </div>
                <p className="text-xs text-text-light mt-0.5">{m.phone || m.email}</p>
                {/* 手机号是会员凭证，没绑号的会员在结算时无法被识别，这里标出来 */}
                {!isValidPhone(m.phone) && (
                  <p className="text-[10px] text-amber-600 mt-0.5">⚠️ 未绑定手机号，无法作为凭证享受折扣</p>
                )}
                <p className="text-[10px] text-text-light mt-0.5">
                  到期 {m.memberExpire ? formatDate(m.memberExpire) : '—'} · 购买 {m.buyCount} 次
                </p>
              </div>
              <button
                onClick={() => adjustMember(m)}
                className="text-[10px] px-3 py-1.5 rounded-full border border-primary-200 text-primary-500 flex-shrink-0"
              >
                调整到期
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---------- 购买订单 ---------- */}
      {tab === TABS[3] && (
        <div className="space-y-3">
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-sm text-text-secondary">已确认收款</p>
              <p className="text-2xl font-bold text-primary-500 mt-1">¥{paidAmount.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-text-secondary">订单数</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{paidCount}</p>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-10"><p className="text-text-light text-sm">暂无购买记录</p></div>
          ) : orders.map(o => {
            const st = ORDER_STATUS[o.status] || { text: o.status, cls: 'text-text-light' }
            return (
              <div key={o.id} className="card">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-text-light">#{o.orderNo?.slice(-8)}</span>
                  <span className={`text-xs font-medium ${st.cls}`}>{st.text}</span>
                </div>
                <p className="text-sm text-text-primary">
                  {o.user?.name || '未知用户'}
                  <span className="text-xs text-text-light ml-2">{o.user?.phone || o.user?.email || ''}</span>
                </p>
                <p className="text-xs text-text-light mt-1">{o.planName} · {o.days} 天</p>
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-warm-100">
                  <span className="text-[10px] text-text-light">
                    {formatDate(o.createdAt)}{o.payTime ? ` · 收款 ${formatDate(o.payTime)}` : ''}
                  </span>
                  <span className="font-semibold text-primary-500">¥{o.price.toFixed(2)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 推送确认弹窗 */}
      {pushCoupon && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPushCoupon(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-3">确认推送</h3>
            <div className="bg-warm-50 rounded-xl p-3 mb-3">
              <p className="text-sm font-medium text-text-primary">{pushCoupon.name}</p>
              <p className="text-xs text-text-light mt-1">
                {pushCoupon.type === 'discount' ? `${pushCoupon.value} 折` : `满 ${pushCoupon.minAmount} 减 ${pushCoupon.value}`}
                {pushCoupon.minAmount > 0 ? '' : ' · 无门槛'}
              </p>
              <p className="text-[10px] text-text-light mt-1">{couponValidityText(pushCoupon)}</p>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              将发送给 <span className="text-primary-500 font-semibold">
                {pushCount === null ? '…' : pushCount} 位
              </span> 在期会员。
              已持有该券的会员也会再收到一张。
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPushCoupon(null)} className="flex-1 py-2 rounded-xl border border-warm-200 text-sm text-text-secondary">取消</button>
              <button
                onClick={confirmPush}
                disabled={pushing || !pushCount}
                className="btn-primary flex-1 text-sm py-2"
              >
                {pushing ? '推送中...' : '确认推送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
