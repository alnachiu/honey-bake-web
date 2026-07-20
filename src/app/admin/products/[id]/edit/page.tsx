'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function EditProductPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchProduct() }, [id])

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${id}`)
      const data = await res.json()
      if (data.product) {
        const p = data.product
        const tags = (() => { try { return JSON.parse(p.tags).join(',') } catch { return '' } })()
        const images = (() => { try { return JSON.parse(p.images || '[]') } catch { return [] } })()
        const detailImages = (() => { try { return JSON.parse(p.detailImages || '[]') } catch { return [] } })()
        setForm({
          name: p.name, price: String(p.price), originalPrice: String(p.originalPrice || ''),
          deliveryFee: String(p.deliveryFee || '0'),
          category: p.category, unit: p.unit, stock: String(p.stock),
          description: p.description || '', detail: p.detail || '', tags,
          images, detailImages
        })
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form || !form.name || !form.price) { alert('请填写完整信息'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price: parseFloat(form.price),
          originalPrice: parseFloat(form.originalPrice || '0'),
          deliveryFee: parseFloat(form.deliveryFee || '0'),
          stock: parseInt(form.stock || '0'),
          tags: form.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean),
          images: form.images || [],
          detailImages: form.detailImages || []
        })
      })
      const data = await res.json()
      if (data.product) { router.push('/admin/products') }
      else { alert(data.error || '保存失败') }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const addImage = () => {
    const url = prompt('请输入商品主图URL:')
    if (url && url.trim()) {
      setForm((p: any) => ({...p, images: [...p.images, url.trim()]}))
    }
  }

  const replaceImage = (index: number) => {
    const url = prompt('请输入新图片URL:', form.images[index] || '')
    if (url && url.trim()) {
      setForm((p: any) => {
        const newImages = [...p.images]
        newImages[index] = url.trim()
        return {...p, images: newImages}
      })
    }
  }

  const removeImage = (index: number) => {
    setForm((p: any) => ({...p, images: p.images.filter((_: any, i: number) => i !== index)}))
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

  if (loading) return <div className="page-container pt-4"><div className="h-48 skeleton rounded-2xl" /></div>
  if (!form) return <div className="page-container pt-20 text-center"><p className="text-text-light">商品不存在</p></div>

  return (
    <div className="page-container pt-4 pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">编辑商品</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="card space-y-3">
          <div><label className="text-xs text-text-secondary block mb-1">商品名称</label><input className="input-field" value={form.name} onChange={e => setForm((p: any) => ({...p, name: e.target.value}))} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-text-secondary block mb-1">售价</label><input type="number" step="0.01" className="input-field" value={form.price} onChange={e => setForm((p: any) => ({...p, price: e.target.value}))} required /></div>
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
          <div><label className="text-xs text-text-secondary block mb-1">邮费（每份）</label>
            <input type="number" step="0.01" className="input-field" value={form.deliveryFee} onChange={e => setForm((p: any) => ({...p, deliveryFee: e.target.value}))} />
          </div>
        </div>
        <div className="card space-y-3">
          <div><label className="text-xs text-text-secondary block mb-1">描述</label><textarea className="input-field min-h-[60px] py-2" value={form.description} onChange={e => setForm((p: any) => ({...p, description: e.target.value}))} /></div>
          <div><label className="text-xs text-text-secondary block mb-1">详细说明</label><textarea className="input-field min-h-[80px] py-2" value={form.detail} onChange={e => setForm((p: any) => ({...p, detail: e.target.value}))} /></div>
          <div><label className="text-xs text-text-secondary block mb-1">标签</label><input className="input-field" value={form.tags} onChange={e => setForm((p: any) => ({...p, tags: e.target.value}))} /></div>
        </div>
        {/* 商品主图管理 */}
        <div className="card space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs text-text-secondary block mb-1">商品主图</label>
            <button type="button" onClick={addImage} className="text-xs px-3 py-1 rounded-full bg-primary-500 text-white">＋ 添加主图</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {form.images.map((url: string, i: number) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-warm-100 group">
                <img src={url} alt={`主图${i+1}`} className="w-full h-full object-cover" />
                {/* 替换按钮 */}
                <button type="button" onClick={() => replaceImage(i)} className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded-full">替换</span>
                </button>
                {/* 删除按钮 */}
                <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center z-10">✕</button>
              </div>
            ))}
            {form.images.length === 0 && (
              <p className="text-xs text-text-light py-3">暂无主图，点击"添加主图"上传</p>
            )}
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
            {form.detailImages.map((url: string, i: number) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-warm-100">
                <img src={url} alt={`详情图${i+1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeDetailImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
            {form.detailImages.length === 0 && (
              <p className="text-xs text-text-light py-3">暂无详情图</p>
            )}
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? '保存中...' : '保存修改'}</button>
      </form>
    </div>
  )
}
