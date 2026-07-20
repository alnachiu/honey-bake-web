'use client'

import { useState, useEffect, useRef } from 'react'

export default function AdminSettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', phone: '', desc: '', paymentQR: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.settings) {
        setForm({
          name: data.settings.name || '甜蜜烘焙',
          phone: data.settings.phone || '',
          desc: data.settings.desc || '用心烘焙每一份甜蜜',
          paymentQR: data.settings.paymentQR || ''
        })
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.name) { setMessage('请输入店铺名称'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (data.settings) { setMessage('✅ 保存成功') }
    } catch (err) { setMessage('保存失败') }
    setSaving(false)
    setTimeout(() => setMessage(''), 2000)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage('图片不能超过2MB'); return }
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setForm(p => ({...p, paymentQR: base64}))
    }
    reader.readAsDataURL(file)
  }

  if (loading) return <div className="page-container pt-4"><div className="h-48 skeleton rounded-2xl" /></div>

  return (
    <div className="page-container pt-4 animate-fade-in pb-20">
      <h1 className="text-lg font-bold text-text-primary mb-4">⚙️ 店铺设置</h1>

      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {/* Basic Info */}
      <div className="card space-y-4 mb-3">
        <p className="text-sm font-medium text-text-primary">📋 基本信息</p>
        <div>
          <label className="text-xs text-text-secondary block mb-1">店铺名称 *</label>
          <input className="input-field text-sm" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">联系电话</label>
          <input className="input-field text-sm" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">店铺描述</label>
          <textarea className="input-field text-sm min-h-[60px] py-2" value={form.desc} onChange={e => setForm(p => ({...p, desc: e.target.value}))} />
        </div>
      </div>

      {/* Payment QR Code */}
      <div className="card space-y-4 mb-3">
        <p className="text-sm font-medium text-text-primary">💳 微信收款码</p>
        <p className="text-xs text-text-light">上传你的微信收款二维码，顾客下单后会看到此二维码扫码付款</p>

        {form.paymentQR ? (
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 bg-white rounded-xl p-3 border border-warm-200 shadow-sm">
              <img src={form.paymentQR} alt="收款码" className="w-full h-full object-contain" />
            </div>
            <button onClick={() => setForm(p => ({...p, paymentQR: ''}))} className="text-xs text-red-400 mt-2">删除二维码</button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-warm-300 rounded-xl py-8 flex flex-col items-center cursor-pointer hover:border-primary-300 transition-colors"
          >
            <span className="text-3xl mb-2">📷</span>
            <span className="text-sm text-text-secondary">点击上传微信收款码</span>
            <span className="text-xs text-text-light mt-1">支持 JPG/PNG，不超过 2MB</span>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full text-sm py-2.5">
        {saving ? '保存中...' : '保存全部配置'}
      </button>
    </div>
  )
}
