'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, isMemberActive } from '@/lib/utils'

/**
 * 顾客查询 / 密码协助。
 *
 * 店主最初的设想是「搜手机号，查出这位顾客现在的密码」。**这件事做不到**：
 * 库里存的是 bcrypt 单向哈希，任何人都无法还原明文，这是密码学的边界而不是权限问题。
 * 所以这里提供的是唯一可行的协助——**清除密码**：清掉之后该顾客只能用手机号
 * 免密登录，进去后可以在「我的」页自己重设密码。订单、优惠券、会员、聊天记录全部保留。
 */
export default function AdminUsersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [phone, setPhone] = useState('')
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searched, setSearched] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    // 店主之外的人进不来（接口也会 403），这里先挡住页面渲染
    if (user.role !== 'admin') { router.push('/'); return }
    search('')
  }, [user, authLoading])

  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 3000)
  }

  const search = async (value: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?phone=${encodeURIComponent(value)}`)
      const data = await res.json()
      if (!res.ok) { flash(data.error || '查询失败'); setList([]); }
      else setList(data.users || [])
    } catch {
      flash('网络异常，请重试')
      setList([])
    }
    setSearched(true)
    setLoading(false)
  }

  const clearPassword = async (u: any) => {
    if (!confirm(
      `清除 ${u.name || u.phone} 的登录密码？\n\n` +
      `清除后该顾客只能用手机号免密登录（登录页输入手机号即可）。\n` +
      `他可以自己重新设置密码。\n\n` +
      `订单、优惠券、会员、聊天记录等全部数据都会保留。`
    )) return

    setBusyId(u.id)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, action: 'clear-password' })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || '操作失败') }
      else {
        flash(data.alreadyClear ? '该账号本来就是免密登录' : '✅ 已清除密码')
        // 本地同步状态，省一次往返
        setList(prev => prev.map(x => (x.id === u.id ? { ...x, hasPassword: false } : x)))
      }
    } catch {
      flash('网络异常，请重试')
    }
    setBusyId('')
  }

  if (authLoading || (user && user.role !== 'admin')) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="h-10 skeleton rounded-xl" />
        {[1, 2].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="page-container pt-4 pb-20 animate-fade-in">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

      <h1 className="text-lg font-bold text-text-primary mb-1">👤 顾客</h1>
      <p className="text-xs text-text-light mb-4 leading-relaxed">
        按手机号查找顾客。顾客忘记密码时，可以在下面帮他清除密码，之后他用手机号就能直接登录。
      </p>

      <form
        onSubmit={e => { e.preventDefault(); search(phone.trim()) }}
        className="flex gap-2 mb-4"
      >
        <input
          className="input-field flex-1"
          inputMode="tel"
          placeholder="输入手机号，可只填前几位"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
        <button type="submit" className="btn-primary px-5 flex-shrink-0">搜索</button>
      </form>

      {loading ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-text-light text-sm">{searched && phone.trim() ? '没有找到这个手机号的顾客' : '还没有顾客'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(u => (
            <div key={u.id} className="card">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text-primary">{u.name || '未填姓名'}</p>
                {isMemberActive(u.memberExpire) && (
                  <span className="text-[10px] text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full flex-shrink-0">会员</span>
                )}
                <span className="text-[10px] text-text-light ml-auto flex-shrink-0">{formatDate(u.createdAt)}</span>
              </div>

              <div className="mt-2 space-y-1">
                <p className="text-xs text-text-secondary">📱 {u.phone || <span className="text-text-light">未绑定手机号</span>}</p>
                <p className="text-xs text-text-light truncate">{u.email}</p>
                <p className="text-xs text-text-light">下单 {u.orderCount} 次</p>
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-warm-100">
                <span className={`text-xs ${u.hasPassword ? 'text-text-secondary' : 'text-primary-500'}`}>
                  {u.hasPassword ? '🔒 有密码' : '📱 免密登录'}
                </span>

                {u.hasPassword ? (
                  <button
                    onClick={() => clearPassword(u)}
                    disabled={busyId === u.id || !u.phone}
                    className="text-xs text-red-500 ml-auto disabled:text-text-light"
                    title={!u.phone ? '该顾客没有绑定手机号，清除密码后将无法登录' : ''}
                  >
                    {busyId === u.id ? '处理中...' : '清除密码'}
                  </button>
                ) : (
                  <span className="text-xs text-text-light ml-auto">已经可以直接用手机号登录</span>
                )}
              </div>

              {/* 没有手机号是硬阻断：手机号是免密登录的唯一凭据，
                  清掉密码等于把这个账号彻底锁死，所以按钮直接禁用并说明原因 */}
              {u.hasPassword && !u.phone && (
                <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">
                  ⚠️ 该顾客没有绑定手机号。清除密码后他将无法用任何方式登录，
                  请先让他用手机号登录一次，或在「我的」页绑定手机号。
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
