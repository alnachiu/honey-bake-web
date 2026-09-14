'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import CouponForm, {
  EMPTY_COUPON_FORM,
  CouponFormValue,
  couponFormToBody,
  couponToForm
} from '@/components/CouponForm'
import { couponValidityText, couponAmountLabel, couponValueText, claimLimitHint } from '@/lib/utils'

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CouponFormValue>(EMPTY_COUPON_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [togglingId, setTogglingId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { fetchCoupons() }, [])

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons?all=true')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(couponFormToBody(form))
      })
      const data = await res.json()
      if (res.ok && data.coupon) {
        setShowForm(false)
        setForm(EMPTY_COUPON_FORM)
        fetchCoupons()
      } else {
        alert(data.error || '创建失败')
      }
    } catch (err) {
      alert('创建失败，请稍后重试')
    }
    setSaving(false)
  }

  /**
   * 显示 / 隐藏快捷开关。
   * PUT 是**全量覆盖**，只发 {id, visible} 会把其余字段一并写空，
   * 所以这里用 couponToForm 把整张券还原成表单值、翻转 visible，再整体发回去。
   */
  const handleToggleVisible = async (c: any) => {
    const next = !c.visible
    setTogglingId(c.id)
    try {
      const body = { id: c.id, ...couponFormToBody({ ...couponToForm(c), visible: next }) }
      const res = await fetch('/api/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        setCoupons(prev => prev.map(k => (k.id === c.id ? { ...k, visible: next } : k)))
        setMessage(next ? '已设为显示，消费者可自行领取' : '已隐藏，只能由你在后台推送')
      } else {
        alert(data.error || '操作失败')
      }
    } catch (err) {
      alert('操作失败，请稍后重试')
    }
    setTogglingId('')
    setTimeout(() => setMessage(''), 2500)
  }

  const handleDelete = async (c: any) => {
    // 删除会连带回收用户已领取的券，确认文案里写清影响面
    const claimCount = c.claimCount || 0
    const tip = claimCount > 0
      ? `已有 ${claimCount} 位用户领取（其中 ${c.usedCount || 0} 位已使用），\n删除后该券将从他们的券包中移除，且不可恢复。\n\n确定删除「${c.name}」吗？`
      : `确定删除「${c.name}」吗？`
    if (!confirm(tip)) return

    setDeletingId(c.id)
    try {
      const res = await fetch('/api/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessage(data.removedClaims > 0 ? `已删除，同时回收 ${data.removedClaims} 张已领券` : '已删除')
        await fetchCoupons()
      } else {
        // 此前这里不检查响应状态，删除失败时静默刷新，表现为「点了没反应」
        alert(data.error || '删除失败')
      }
    } catch (err) {
      alert('删除失败，请稍后重试')
    }
    setDeletingId('')
    setTimeout(() => setMessage(''), 2500)
  }

  return (
    <div className="page-container pt-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">🎫 优惠券管理</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/membership" className="text-xs px-3 py-2 rounded-full border border-primary-200 text-primary-500">💎 会员卡</Link>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs rounded-full">＋ 新增</button>
        </div>
      </div>

      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {showForm && (
        <div className="card mb-4 animate-slide-up">
          <CouponForm
            value={form}
            onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            onSubmit={handleCreate}
            submitting={saving}
            submitText="创建优惠券"
            onCancel={() => { setShowForm(false); setForm(EMPTY_COUPON_FORM) }}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无优惠券</p></div>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => {
            const soldOut = c.stock > 0 && c.claimed >= c.stock
            return (
              <div key={c.id} className="card">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-primary-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-primary-500">{couponAmountLabel(c)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-light mt-0.5">{c.description || couponValueText(c)}</p>
                    <p className="text-[10px] text-text-light mt-0.5">{couponValidityText(c)}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {c.type === 'gift' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-500">🎁 买赠</span>
                      )}
                      {/* 隐藏券：消费者看不到也不能自领，只能后台推送。券本身仍然有效 */}
                      {c.visible === false && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">🙈 已隐藏</span>
                      )}
                      {(c.autoPushPlans || []).map((p: any) => (
                        <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                          💎 {p.name} 自动推送
                        </span>
                      ))}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.validMode === 'relative' ? 'bg-blue-50 text-blue-500' : 'bg-warm-100 text-text-light'}`}>
                        {c.validMode === 'relative' ? '领取后生效' : '固定日期'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.stackable ? 'bg-green-50 text-green-600' : 'bg-warm-100 text-text-light'}`}>
                        {c.stackable ? '可叠加' : '不可叠加'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-warm-100 text-text-light">
                        {claimLimitHint(c) || '不限领取'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${soldOut ? 'bg-red-50 text-red-400' : 'bg-warm-100 text-text-light'}`}>
                        {soldOut ? '已领完 · ' : ''}已领 {c.claimed}{c.stock > 0 ? ` / ${c.stock}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Link
                      href={`/admin/coupons/${c.id}/edit`}
                      className="text-[10px] px-2 py-1 rounded-full border border-primary-200 text-primary-500 text-center"
                    >
                      编辑
                    </Link>
                    <button
                      onClick={() => handleToggleVisible(c)}
                      disabled={togglingId === c.id}
                      className="text-[10px] px-2 py-1 rounded-full border border-warm-300 text-text-secondary disabled:opacity-50"
                    >
                      {togglingId === c.id ? '处理中' : c.visible === false ? '显示' : '隐藏'}
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      className="text-[10px] px-2 py-1 rounded-full border border-red-200 text-red-400 disabled:opacity-50"
                    >
                      {deletingId === c.id ? '删除中' : '删除'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
