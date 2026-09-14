'use client'

import { useState, useEffect } from 'react'

const EMPTY_FORM = {
  name: '',
  type: 'reduce',
  value: '',
  minAmount: '0',
  stock: '0',
  perUserLimit: '1',
  stackable: false,
  startTime: '',
  endTime: '',
  description: ''
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
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
    if (!form.name || !form.value || !form.startTime || !form.endTime) { alert('请填写完整信息'); return }
    if (form.type === 'discount' && parseFloat(form.value) >= 10) { alert('折扣力度需小于 10 折'); return }
    if (form.startTime > form.endTime) { alert('开始时间不能晚于结束时间'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (res.ok && data.coupon) {
        setShowForm(false)
        setForm(EMPTY_FORM)
        fetchCoupons()
      } else {
        alert(data.error || '创建失败')
      }
    } catch (err) {
      alert('创建失败，请稍后重试')
    }
    setSaving(false)
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
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs rounded-full">＋ 新增</button>
      </div>

      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {showForm && (
        <div className="card mb-4 space-y-3 animate-slide-up">
          <div><input className="input-field text-sm" placeholder="优惠券名称" value={form.name} onChange={e => setForm((p: any) => ({...p,name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><select className="input-field text-sm" value={form.type} onChange={e => setForm((p: any) => ({...p,type: e.target.value}))}><option value="reduce">满减</option><option value="discount">折扣</option></select></div>
            <div><input type="number" step="0.1" className="input-field text-sm" placeholder={form.type === 'reduce' ? '减多少元' : '打几折(如9)'} value={form.value} onChange={e => setForm((p: any) => ({...p,value: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><input type="number" className="input-field text-sm" placeholder="最低消费" value={form.minAmount} onChange={e => setForm((p: any) => ({...p,minAmount: e.target.value}))} /></div>
            <div><input type="number" className="input-field text-sm" placeholder="库存(0不限)" value={form.stock} onChange={e => setForm((p: any) => ({...p,stock: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><input type="date" className="input-field text-sm" value={form.startTime} onChange={e => setForm((p: any) => ({...p,startTime: e.target.value}))} /></div>
            <div><input type="date" className="input-field text-sm" value={form.endTime} onChange={e => setForm((p: any) => ({...p,endTime: e.target.value}))} /></div>
          </div>
          <div><input className="input-field text-sm" placeholder="描述" value={form.description} onChange={e => setForm((p: any) => ({...p,description: e.target.value}))} /></div>

          {/* 每人限领 */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-text-primary">每人最多领取</p>
              <p className="text-[10px] text-text-light mt-0.5">填 0 表示不限量</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button type="button" onClick={() => setForm((p: any) => ({...p, perUserLimit: String(Math.max(0, parseInt(p.perUserLimit || '0', 10) - 1))}))} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">−</button>
              <input type="number" min="0" className="input-field text-sm w-16 text-center" value={form.perUserLimit} onChange={e => setForm((p: any) => ({...p,perUserLimit: e.target.value}))} />
              <button type="button" onClick={() => setForm((p: any) => ({...p, perUserLimit: String(parseInt(p.perUserLimit || '0', 10) + 1)}))} className="w-7 h-7 bg-warm-100 rounded-full flex items-center justify-center text-sm text-text-secondary">＋</button>
            </div>
          </div>

          {/* 可叠加 */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-text-primary">允许叠加使用</p>
              <p className="text-[10px] text-text-light mt-0.5">需两张券都开启，才能在同一笔订单同时使用</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((p: any) => ({...p, stackable: !p.stackable}))}
              className={`ml-2 w-12 h-7 rounded-full transition-colors flex-shrink-0 ${form.stackable ? 'bg-green-400' : 'bg-warm-400'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${form.stackable ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <button onClick={handleCreate} disabled={saving} className="btn-primary w-full text-sm py-2">{saving ? '创建中...' : '创建优惠券'}</button>
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
                    <span className="text-lg font-bold text-primary-500">{c.type === 'reduce' ? '¥' : ''}{c.value}{c.type === 'discount' ? '折' : ''}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-light mt-0.5">{c.description || '无门槛'}</p>
                    <p className="text-[10px] text-text-light mt-0.5">{c.startTime} ~ {c.endTime}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.stackable ? 'bg-green-50 text-green-600' : 'bg-warm-100 text-text-light'}`}>
                        {c.stackable ? '可叠加' : '不可叠加'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-warm-100 text-text-light">
                        每人限领 {c.perUserLimit > 0 ? `${c.perUserLimit} 张` : '不限'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${soldOut ? 'bg-red-50 text-red-400' : 'bg-warm-100 text-text-light'}`}>
                        {soldOut ? '已领完 · ' : ''}已领 {c.claimed}{c.stock > 0 ? ` / ${c.stock}` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deletingId === c.id}
                    className="text-[10px] px-2 py-1 rounded-full border border-red-200 text-red-400 disabled:opacity-50 flex-shrink-0"
                  >
                    {deletingId === c.id ? '删除中' : '删除'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
