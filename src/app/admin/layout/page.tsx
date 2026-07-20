'use client'

import { useState, useEffect, useRef } from 'react'
import ImageCropper from '@/components/ImageCropper'

const SECTION_LABELS: Record<string, string> = {
  banner: '顶部轮播图',
  quickNav: '快捷导航',
  coupon: '优惠券入口',
  products: '商品列表',
}

const SECTION_ICONS: Record<string, string> = {
  banner: '🖼️',
  quickNav: '🧭',
  coupon: '🎫',
  products: '📦',
}

export default function AdminLayoutPage() {
  const [layout, setLayout] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('sections')
  const [croppingImage, setCroppingImage] = useState<string | null>(null)
  const [croppingIndex, setCroppingIndex] = useState<number>(-1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchLayout() }, [])

  const fetchLayout = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings?.layout) {
        const parsed = typeof data.settings.layout === 'string'
          ? JSON.parse(data.settings.layout)
          : data.settings.layout
        setLayout(parsed)
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const toggleSection = (index: number) => {
    const newLayout = { ...layout }
    newLayout.sections = [...newLayout.sections]
    newLayout.sections[index] = { ...newLayout.sections[index], visible: !newLayout.sections[index].visible }
    setLayout(newLayout)
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= layout.sections.length) return
    const newLayout = { ...layout }
    newLayout.sections = [...newLayout.sections]
    const temp = newLayout.sections[index]
    newLayout.sections[index] = newLayout.sections[newIndex]
    newLayout.sections[newIndex] = temp
    newLayout.sections = newLayout.sections.map((s: any, i: number) => ({ ...s, order: i }))
    setLayout(newLayout)
  }

  // Banner management
  const updateBanner = (index: number, value: string) => {
    const newLayout = { ...layout }
    newLayout.banners = [...(newLayout.banners || [])]
    newLayout.banners[index] = { ...newLayout.banners[index], image: value }
    setLayout(newLayout)
  }

  const addBanner = () => {
    if ((layout?.banners?.length || 0) >= 3) { setMessage('最多3张轮播图'); setTimeout(() => setMessage(''), 2000); return }
    const newLayout = { ...layout }
    newLayout.banners = [...(newLayout.banners || []), { image: 'https://picsum.photos/seed/banner' + Date.now() + '/750/320', link: '' }]
    setLayout(newLayout)
  }

  const removeBanner = (index: number) => {
    const newLayout = { ...layout }
    newLayout.banners = (newLayout.banners || []).filter((_: any, i: number) => i !== index)
    setLayout(newLayout)
  }

  // Category management
  const updateCategory = (index: number, value: string) => {
    const newLayout = { ...layout }
    newLayout.categories = [...(newLayout.categories || ['全部', '曲奇', '糖果', '零食', '礼盒'])]
    newLayout.categories[index] = value
    setLayout(newLayout)
  }

  const addCategory = () => {
    const newLayout = { ...layout }
    newLayout.categories = [...(newLayout.categories || ['全部', '曲奇', '糖果', '零食', '礼盒']), '新分类']
    setLayout(newLayout)
  }

  const removeCategory = (index: number) => {
    if (index === 0) return
    const newLayout = { ...layout }
    newLayout.categories = (newLayout.categories || ['全部', '曲奇', '糖果', '零食', '礼盒']).filter((_: any, i: number) => i !== index)
    setLayout(newLayout)
  }

  // Quick nav management
  const updateQuickNav = (index: number, field: string, value: string) => {
    const newLayout = { ...layout }
    newLayout.quickNav = [...(newLayout.quickNav || [])]
    newLayout.quickNav[index] = { ...newLayout.quickNav[index], [field]: value }
    setLayout(newLayout)
  }

  const addQuickNav = () => {
    const newLayout = { ...layout }
    newLayout.quickNav = [...(newLayout.quickNav || []), { icon: '🍪', label: '新导航', category: '' }]
    setLayout(newLayout)
  }

  const removeQuickNav = (index: number) => {
    const newLayout = { ...layout }
    newLayout.quickNav = (newLayout.quickNav || []).filter((_: any, i: number) => i !== index)
    setLayout(newLayout)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout })
      })
      const data = await res.json()
      if (data.settings) {
        setMessage('✅ 保存成功')
      } else {
        setMessage('❌ ' + (data.error || '保存失败'))
      }
    } catch (err) { setMessage('保存失败') }
    setSaving(false)
    setTimeout(() => setMessage(''), 2000)
  }

  if (loading) return <div className="page-container pt-4"><div className="h-48 skeleton rounded-2xl" /></div>

  const sections = layout?.sections?.sort((a: any, b: any) => a.order - b.order) || []
  const categories = layout?.categories || ['全部', '曲奇', '糖果', '零食', '礼盒']
  const quickNav = layout?.quickNav || []
  const banners = layout?.banners || []

  return (
    <div className="page-container pt-4 animate-fade-in pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-1">🎨 首页排版</h1>
      <p className="text-sm text-text-light mb-4">自定义首页各模块内容</p>

      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex mb-4 bg-warm-100 rounded-xl p-1">
        {[
          { key: 'sections', label: '📐 模块' },
          { key: 'categories', label: '🏷️ 分类' },
          { key: 'quicknav', label: '🧭 导航' },
          { key: 'banners', label: '🖼️ 轮播' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              activeTab === tab.key ? 'bg-white text-text-primary font-medium shadow-sm' : 'text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sections Tab */}
      {activeTab === 'sections' && (
        <div className="space-y-3 mb-6">
          {sections.map((section: any, index: number) => (
            <div key={section.type} className="card flex items-center gap-3">
              <div className="text-2xl">{SECTION_ICONS[section.type] || '📄'}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{SECTION_LABELS[section.type] || section.type}</p>
                <p className="text-xs text-text-light">{section.visible ? '🟢 显示中' : '🔴 已隐藏'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="w-7 h-7 flex items-center justify-center rounded-full bg-warm-100 disabled:opacity-30 text-sm">↑</button>
                <button onClick={() => moveSection(index, 'down')} disabled={index === sections.length - 1} className="w-7 h-7 flex items-center justify-center rounded-full bg-warm-100 disabled:opacity-30 text-sm">↓</button>
                <button onClick={() => toggleSection(index)} className={`ml-2 w-12 h-7 rounded-full transition-colors ${section.visible ? 'bg-green-400' : 'bg-warm-400'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${section.visible ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-text-light text-center">↑↓ 调整顺序，开关控制显示/隐藏</p>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="mb-6">
          <div className="card space-y-3">
            {categories.map((cat: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                {index === 0 ? (
                  <div className="flex-1 bg-warm-50 rounded-xl px-3 py-2.5 text-sm text-text-light">{cat}（固定）</div>
                ) : (
                  <input className="input-field flex-1 text-sm" value={cat} onChange={e => updateCategory(index, e.target.value)} />
                )}
                {index > 0 && (
                  <button onClick={() => removeCategory(index)} className="w-8 h-8 flex items-center justify-center text-red-400 text-sm">✕</button>
                )}
              </div>
            ))}
            <button onClick={addCategory} className="w-full py-2 rounded-xl border-2 border-dashed border-warm-300 text-sm text-text-secondary hover:border-primary-300 hover:text-primary-500 transition-colors">＋ 添加分类</button>
          </div>
          <p className="text-xs text-text-light mt-2 text-center">修改后首页商品分类标签会同步更新</p>
        </div>
      )}

      {/* Quick Nav Tab */}
      {activeTab === 'quicknav' && (
        <div className="mb-6">
          {quickNav.map((item: any, index: number) => (
            <div key={index} className="card mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">导航 #{index + 1}</span>
                <button onClick={() => removeQuickNav(index)} className="text-xs text-red-400">删除</button>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <div className="w-11 h-11 bg-warm-100 rounded-xl flex items-center justify-center text-xl">{item.icon}</div>
                  <select className="absolute inset-0 opacity-0 w-full h-full" value={item.icon} onChange={e => updateQuickNav(index, 'icon', e.target.value)}>
                    {['🍪','🍬','🥜','🎁','🧁','🍫','🍩','🥮','☕','🧋','🍦','🍰','🏆','🔥','⭐','💝','🧸','🌸','🎂','🥐'].map(icon => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 space-y-2">
                  <input className="input-field text-sm" placeholder="导航名称" value={item.label} onChange={e => updateQuickNav(index, 'label', e.target.value)} />
                  <input className="input-field text-sm" placeholder="关联分类（如：曲奇）" value={item.category || ''} onChange={e => updateQuickNav(index, 'category', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addQuickNav} className="w-full py-3 rounded-xl border-2 border-dashed border-warm-300 text-sm text-text-secondary hover:border-primary-300 hover:text-primary-500 transition-colors">＋ 添加快捷导航</button>
        </div>
      )}

      {/* Banners Tab */}
      {activeTab === 'banners' && (
        <div className="mb-6">
          <div className="space-y-3">
            {banners.map((banner: any, index: number) => (
              <div key={index} className="card space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-secondary">轮播图 #{index + 1}</span>
                  <button onClick={() => removeBanner(index)} className="text-xs text-red-400">删除</button>
                </div>
                {banner.image ? (
                  <div className="relative group">
                    <img src={banner.image} alt="banner preview" className="w-full h-28 rounded-xl object-cover bg-warm-100" />
                    <button
                      onClick={() => { setCroppingIndex(index); setCroppingImage(banner.image) }}
                      className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >调整</button>
                  </div>
                ) : (
                  <div className="w-full h-28 rounded-xl bg-warm-100 flex items-center justify-center text-text-light text-sm">暂无图片</div>
                )}
              </div>
            ))}
            {(banners.length || 0) < 3 && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { setMessage('图片不能超过5MB'); setTimeout(() => setMessage(''), 2000); return }
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    setCroppingImage(event.target?.result as string)
                    setCroppingIndex(banners.length)
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }} />
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-warm-300 text-sm text-text-secondary hover:border-primary-300 hover:text-primary-500 transition-colors">
                  ＋ 本地上传轮播图（{banners.length}/3）
                </button>
              </>
            )}
            {banners.length === 0 && <p className="text-xs text-text-light text-center py-4">暂无轮播图，点击上方上传</p>}
          </div>
          <p className="text-xs text-text-light mt-2 text-center">图片推荐尺寸 750x320px，可上传后裁剪调整</p>
        </div>
      )}

            {/* Image Cropper Modal */}
      {croppingImage && (
        <ImageCropper
          image={croppingImage}
          onCropComplete={(cropped) => {
            const nl = JSON.parse(JSON.stringify(layout))
            if (!nl.banners) nl.banners = []
            if (croppingIndex >= nl.banners.length) {
              nl.banners.push({ image: cropped, link: '' })
            } else {
              nl.banners[croppingIndex] = { image: cropped, link: '' }
            }
            setLayout(nl)
            setCroppingImage(null)
          }}
          onCancel={() => setCroppingImage(null)}
        />
      )}

<button onClick={handleSave} disabled={saving} className="btn-primary w-full text-sm py-2.5">
        {saving ? '保存中...' : '保存全部配置'}
      </button>
    </div>
  )
}
