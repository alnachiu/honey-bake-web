'use client'

import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (!user) router.push('/login') }, [user])

  useEffect(() => {
    if (user) setAvatarUrl(user.avatar || '')
  }, [user])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage('图片不能超过2MB'); return }

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string
      setAvatarUrl(base64)
      setSaving(true)
      try {
        const res = await fetch('/api/users/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar: base64 })
        })
        if (res.ok) {
          await refreshUser()
          setMessage('✅ 头像已更新')
        } else {
          setMessage('更新失败')
        }
      } catch (err) { setMessage('更新失败') }
      setSaving(false)
      setTimeout(() => setMessage(''), 2000)
    }
    reader.readAsDataURL(file)
  }

  // Cute preset avatars
  const presets = [
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Kitty&backgroundColor=fff0e8',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Bear&backgroundColor=ffecd6',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Bunny&backgroundColor=f0f0ff',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Panda&backgroundColor=e8fff0',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Cookie&backgroundColor=fff5f0',
    'https://api.dicebear.com/7.x/adventurer/svg?seed=Honey&backgroundColor=fef0ff',
  ]

  const selectPreset = async (url: string) => {
    setAvatarUrl(url)
    setSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: url })
      })
      if (res.ok) { await refreshUser(); setMessage('✅ 头像已更新') }
    } catch (err) { setMessage('更新失败') }
    setSaving(false)
    setTimeout(() => setMessage(''), 2000)
  }

  if (!user) return null

  const showAvatar = avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(user.name || 'user')}&backgroundColor=fff0e8`

  return (
    <div className="page-container pt-4 animate-fade-in pb-20">
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {message}
        </div>
      )}

      {/* Avatar */}
      <div className="card flex flex-col items-center py-8 mb-4">
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary-100 shadow-md">
            <img src={showAvatar} alt={user.name} className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs font-medium">📷 换头像</span>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        <p className="font-semibold text-text-primary text-lg mt-3">{user.name}</p>
        <p className="text-sm text-text-light">{user.email}</p>
        {user.phone && <p className="text-xs text-text-light mt-0.5">{user.phone}</p>}
        <p className="text-xs text-text-light mt-2">👆 点击头像可上传照片</p>

        {saving && <p className="text-xs text-primary-500 mt-2">更新中...</p>}
      </div>

      {/* Preset Avatars */}
      <div className="card mb-4">
        <p className="text-xs text-text-secondary mb-3">🎨 选择一个可爱头像</p>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {presets.map((url, i) => (
            <button key={i} onClick={() => selectPreset(url)} className={`w-14 h-14 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all hover:scale-110 ${avatarUrl === url ? 'border-primary-500 shadow-md' : 'border-transparent'}`}>
              <img src={url} alt={`头像${i+1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="card divide-y divide-warm-100">
        <Link href="/orders" className="flex items-center py-3.5">
          <span className="text-lg mr-3">📋</span>
          <span className="text-sm text-text-primary flex-1">我的订单</span>
          <span className="text-text-light">›</span>
        </Link>
        <Link href="/coupons" className="flex items-center py-3.5">
          <span className="text-lg mr-3">🎫</span>
          <span className="text-sm text-text-primary flex-1">优惠券</span>
          <span className="text-text-light">›</span>
        </Link>
      </div>

      {user.role === 'admin' && (
        <div className="card mt-3">
          <p className="text-xs text-primary-500 font-medium mb-2">⚙️ 管理后台</p>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/admin" className="p-3 bg-warm-50 rounded-xl text-center"><p className="text-lg">📊</p><p className="text-xs text-text-secondary mt-1">数据概览</p></Link>
            <Link href="/admin/products" className="p-3 bg-warm-50 rounded-xl text-center"><p className="text-lg">📦</p><p className="text-xs text-text-secondary mt-1">商品管理</p></Link>
            <Link href="/admin/orders" className="p-3 bg-warm-50 rounded-xl text-center"><p className="text-lg">📋</p><p className="text-xs text-text-secondary mt-1">订单管理</p></Link>
          </div>
        </div>
      )}

      <button onClick={logout} className="w-full mt-6 py-3 text-center text-sm text-text-light">退出登录</button>
    </div>
  )
}
