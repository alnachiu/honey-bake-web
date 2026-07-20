'use client'

import { useState, useEffect } from 'react'

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'reduce', value: '', minAmount: '0', stock: '0', startTime: '', endTime: '', description: '' })
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    try {
      const res = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (data.coupon) { setShowForm(false); setForm({ name: '', type: 'reduce', value: '', minAmount: '0', stock: '0', startTime: '', endTime: '', description: '' }); fetchCoupons() }
      else { alert(data.error) }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除？')) return
    try {
      await fetch('/api/coupons', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      fetchCoupons()
    } catch (err) { console.error(err) }
  }

  const typeText = (t: string) => t === 'reduce' ? '满减' : '折扣'

  return (
    <div className="page-container pt-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">🎫 优惠券管理</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs rounded-full">＋ 新增</button>
      </div>

      {showForm && (
        <div className="card mb-4 space-y-3 animate-slide-up">
          <div><input className="input-field text-sm" placeholder="优惠券名称" value={form.name} onChange={e => setForm((p: any) => ({...p,name: e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><select className="input-field text-sm" value={form.type} onChange={e => setForm((p: any) => ({...p,type: e.target.value}))}><option value="reduce">满减</option><option value="discount">折扣</option></select></div>
            <div><input type="number" step="0.1" className="input-field text-sm" placeholder={form.type === 'reduce' ? '减多少元' : '打几折'} value={form.value} onChange={e => setForm((p: any) => ({...p,value: e.target.value}))} /></div>
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
          <button onClick={handleCreate} disabled={saving} className="btn-primary w-full text-sm py-2">{saving ? '创建中...' : '创建优惠券'}</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16"><p className="text-text-light">暂无优惠券</p></div>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => (
            <div key={c.id} className="card">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-primary-50 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-primary-500">{c.type === 'reduce' ? '¥' : ''}{c.value}{c.type === 'discount' ? '折' : ''}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{c.name}</p>
                  <p className="text-xs text-text-light mt-0.5">{c.description || '无门槛'}</p>
                  <p className="text-[10px] text-text-light mt-0.5">{c.startTime} ~ {c.endTime}</p>
                </div>
                <button onClick={() => handleDelete(c.id)} className="text-[10px] px-2 py-1 rounded-full border border-red-200 text-red-400">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
