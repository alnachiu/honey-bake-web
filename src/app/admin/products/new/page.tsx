'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function NewProductPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', price: '', originalPrice: '', deliveryFee: '0',
    category: '曲奇', unit: '份', stock: '0',
    description: '', detail: '', tags: '',
    images: [] as string[],
    detailImages: [] as string[]
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const mainImgInputRef = useRef<HTMLInputElement>(null)
  const replaceImgIndexRef = useRef<number>(-1)
  const detailImgInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); return null }
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) return data.url
      alert(data.error || '上传失败')
      return null
    } catch (err) { console.error(err); alert('上传失败'); return null }
    finally { setUploading(false) }
  }

  const handleMainImgSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadFile(file)
    if (url) {
      const idx = replaceImgIndexRef.current
      if (idx >= 0) {
        // 替换指定位置的图片
        setForm((p: any) => {
          const newImages = [...p.images]
          newImages[idx] = url
          return {...p, images: newImages}
        })
        replaceImgIndexRef.current = -1
      } else {
        // 新增图片
        setForm((p: any) => ({...p, images: [...p.images, url]}))
      }
    }
    e.target.value = ''
  }

  const handleDetailImgSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadFile(file)
    if (url) {
      setForm((p: any) => ({...p, detailImages: [...p.detailImages, url]}))
    }
    e.target.value = ''
  }

  const addImage = () => {
    replaceImgIndexRef.current = -1
    mainImgInputRef.current?.click()
  }

  const replaceImage = (index: number) => {
    replaceImgIndexRef.current = index
    mainImgInputRef.current?.click()
  }

  const removeImage = (index: number) => {
    setForm((p: any) => ({...p, images: p.images.filter((_: any, i: number) => i !== index)}))
  }

  const addDetailImage = () => {
    detailImgInputRef.current?.click()
  }

  const removeDetailImage = (index: number) => {
    setForm((p: any) => ({...p, detailImages: p.detailImages.filter((_: any, i: number) => i !== index)}))
  }

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
          images: form.images.length > 0 ? form.images : ['https://picsum.photos/seed/' + Date.now() + '/400/400'],
          detailImages: form.detailImages.length > 0 ? form.detailImages : []
        })
      })
      const data = await res.json()
      if (data.product) { router.push('/admin/products') }
      else { alert(data.error || '创建失败') }
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <div className="page-container pt-4 pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">新增商品</h1>

      {/* 隐藏的文件输入框 */}
      <input
        ref={mainImgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleMainImgSelect}
      />
      <input
        ref={detailImgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleDetailImgSelect}
      />

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
        {/* 商品主图管理 */}
        <div className="card space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs text-text-secondary block mb-1">商品主图</label>
            <button type="button" onClick={addImage} disabled={uploading} className="text-xs px-3 py-1 rounded-full bg-primary-500 text-white disabled:opacity-50">
              {uploading ? '上传中...' : '＋ 本地上传主图'}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {form.images.map((url: string, i: number) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-warm-100 group">
                <img src={url} alt={`主图${i+1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => replaceImage(i)} className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded-full">替换</span>
                </button>
                <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center z-10">✕</button>
              </div>
            ))}
            {form.images.length === 0 && (
              <p className="text-xs text-text-light py-3">暂无主图，点击"本地上传主图"选择图片。不设置将使用默认图片</p>
            )}
          </div>
        </div>
        <div className="card space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs text-text-secondary block mb-1">详情页图片（最多5张）</label>
            {form.detailImages.length < 5 && (
              <button type="button" onClick={addDetailImage} disabled={uploading} className="text-xs px-3 py-1 rounded-full bg-primary-500 text-white disabled:opacity-50">
                {uploading ? '上传中...' : '＋ 本地上传'}
              </button>
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
              <p className="text-xs text-text-light py-3">暂无详情图，点击"本地上传"选择图片</p>
            )}
          </div>
        </div>
        <button type="submit" disabled={saving || uploading} className="btn-primary w-full">{saving ? '创建中...' : '创建商品'}</button>
      </form>
    </div>
  )
}
