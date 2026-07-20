'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewProductPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', price: '', originalPrice: '', deliveryFee: '0',
    category: '曲奇', unit: '份', stock: '0',
    description: '', detail: '', tags: '',
    detailImages: [] as string[]
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.price) { alert('请填写商品名称和售价'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price: parseFloat(form.price),
          originalPrice: parseFloat(form.originalPrice || '0'),
          deliveryFee: parseFloat(form.deliveryFee || '0'),
          stock: parseInt(form.stock || '0'),
          tags: form.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean),
          images: ['https://picsum.photos/seed/' + Date.now() + '/400/400'],
          detailImages: form.detailImages.length > 0 ? form.detailImages : []
        })
      })
      const data = await res.json()
      if (data.product) { router.push('/admin/products') }
      else { alert(data.error || '创建失败') }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const addDetailImage = () => {
    const url = prompt('请输入图片URL:')
    if (url && form.detailImages.length < 5) {
      setForm((p: any) => ({...p, detailImages: [...p.detailImages, url]}))
    }
  }

  const removeDetailImage = (index: number) => {
    setForm((p: any) => ({...p, detailImages: p.detailImages.filter((_: any, i: number) => i !== index)}))
  }

  return (
    <div className="page-container pt-4 pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">新增商品</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="card space-y-3">
          <div><label className="text-xs text-text-secondary block mb-1">商品名称 *</label><input className="input-field" value={form.name} onChange={e => setForm((p: any) => ({...p, name: e.target.value}))} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-text-secondary block mb-1">售价 *</label><input type="number" step="0.01" className="input-field" value={form.price} onChange={e => setForm((p: any) => ({...p, price: e.target.value}))} required /></div>
            <div><label className="text-xs text-text-secondary block mb-1">原价</label><input type="number" step="0.01" className="input-field" value={form.originalPrice} onChange={e => setForm((p: any) => ({...p, originalPrice: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-text-secondary block mb-1">分类</label>
              <select className="input-field" value={form.category} onChange={e => setForm((p: any) => ({...p, category: e.target.value}))}>
                <option>曲奇</option><option>糖果</option><option>零食</option><option>礼盒</option>
              </select>
            </div>
            <div><label className="text-xs text-text-secondary block mb-1">单位</label><input className="input-field" value={form.unit} onChange={e => setForm((p: any) => ({...p, unit: e.target.value}))} /></div>
            <div><label className="text-xs text-text-secondary block mb-1">库存</label><input type="number" className="input-field" value={form.stock} onChange={e => setForm((p: any) => ({...p, stock: e.target.value}))} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div><label className="text-xs text-text-secondary block mb-1">邮费（每份）</label>
              <input type="number" step="0.01" className="input-field" placeholder="0" value={form.deliveryFee} onChange={e => setForm((p: any) => ({...p, deliveryFee: e.target.value}))} />
              <p className="text-[10px] text-text-light mt-0.5">每个商品单独计算邮费，总价 = (单价 × 数量) + 邮费</p>
            </div>
          </div>
        </div>
        <div className="card space-y-3">
          <div><label className="text-xs text-text-secondary block mb-1">描述</label>
            <textarea className="input-field min-h-[60px] py-2" value={form.description} onChange={e => setForm((p: any) => ({...p, description: e.target.value}))} />
          </div>
          <div><label className="text-xs text-text-secondary block mb-1">详细说明</label>
            <textarea className="input-field min-h-[80px] py-2" value={form.detail} onChange={e => setForm((p: any) => ({...p, detail: e.target.value}))} />
          </div>
          <div><label className="text-xs text-text-secondary block mb-1">标签（逗号分隔）</label>
            <input className="input-field" placeholder="如：热销,新品,推荐" value={form.tags} onChange={e => setForm((p: any) => ({...p, tags: e.target.value}))} />
          </div>
        </div>
        <div className="card space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs text-text-secondary block mb-1">详情页图片（最多5张）</label>
            {form.detailImages.length < 5 && (
              <button type="button" onClick={addDetailImage} className="text-xs px-3 py-1 rounded-full bg-primary-500 text-white">＋ 添加</button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {form.detailImages.map((url, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-warm-100">
                <img src={url} alt={`详情图${i+1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeDetailImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
            {form.detailImages.length === 0 && (
              <p className="text-xs text-text-light py-3">暂无详情图，点击"添加"输入图片URL</p>
            )}
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? '创建中...' : '创建商品'}</button>
      </form>
    </div>
  )
}
