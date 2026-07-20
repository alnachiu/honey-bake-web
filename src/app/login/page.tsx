'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, refreshUser } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'phone') {
        if (!/^1[3-9]\d{9}$/.test(phone)) { setError('请输入正确的手机号'); setLoading(false); return }
        const res = await fetch('/api/auth/phone-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        })
        const data = await res.json()
        if (res.ok) {
          await refreshUser()
          router.push('/')
        } else {
          setError(data.error || '登录失败')
        }
      } else {
        await login(email, password)
        router.push('/')
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="text-center mb-8 animate-fade-in">
        <div className="text-6xl mb-4">🍪</div>
        <h1 className="text-2xl font-bold text-text-primary">甜蜜烘焙</h1>
        <p className="text-text-light text-sm mt-1">用心烘焙每一份甜蜜</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm animate-slide-up">
        {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3 mb-4 text-center">{error}</div>}

        {/* Tabs */}
        <div className="flex mb-4 bg-warm-100 rounded-xl p-1">
          <button type="button" onClick={() => setMode('phone')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === 'phone' ? 'bg-white text-text-primary font-medium shadow-sm' : 'text-text-secondary'}`}>手机号登录</button>
          <button type="button" onClick={() => setMode('email')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === 'email' ? 'bg-white text-text-primary font-medium shadow-sm' : 'text-text-secondary'}`}>邮箱登录</button>
        </div>

        <div className="card mb-4 space-y-4">
          {mode === 'phone' ? (
            <div>
              <label className="text-sm text-text-secondary mb-1.5 block">手机号</label>
              <input type="tel" className="input-field" placeholder="请输入手机号" maxLength={11} value={phone} onChange={e => setPhone(e.target.value)} required />
              <p className="text-xs text-text-light mt-1.5">已有账号直接登录，新用户自动创建</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm text-text-secondary mb-1.5 block">邮箱</label>
                <input type="email" className="input-field" placeholder="请输入邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm text-text-secondary mb-1.5 block">密码</label>
                <input type="password" className="input-field" placeholder="请输入密码" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? '处理中...' : mode === 'phone' ? '登录 / 自动注册' : '登录'}
        </button>

        {mode === 'email' && (
          <p className="text-center text-sm text-text-light mt-4">
            还没有账号？<Link href="/register" className="text-primary-500 ml-1 font-medium">立即注册</Link>
          </p>
        )}
      </form>
    </div>
  )
}
