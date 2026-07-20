'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('密码至少6位'); return }
    setLoading(true)
    try {
      await register(email, name, password)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="text-center mb-8 animate-fade-in">
        <div className="text-6xl mb-4">🍪</div>
        <h1 className="text-2xl font-bold text-text-primary">注册账号</h1>
        <p className="text-text-light text-sm mt-1">加入甜蜜烘焙，享受美味</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm animate-slide-up">
        {error && <div className="bg-red-50 text-red-500 text-sm rounded-xl px-4 py-3 mb-4 text-center">{error}</div>}

        <div className="card mb-4 space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">昵称</label>
            <input className="input-field" placeholder="请输入昵称" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">邮箱</label>
            <input type="email" className="input-field" placeholder="请输入邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">密码</label>
            <input type="password" className="input-field" placeholder="至少6位密码" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? '注册中...' : '注册'}
        </button>

        <p className="text-center text-sm text-text-light mt-4">
          已有账号？<Link href="/login" className="text-primary-500 ml-1 font-medium">去登录</Link>
        </p>
      </form>
    </div>
  )
}
