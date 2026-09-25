'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { formatDate } from '@/lib/utils'

const TYPE_ICON: Record<string, string> = {
  coupon: '🎫',
  member: '💎',
  order: '📋',
  system: '🔔'
}

export default function MessagesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [list, setList] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 等认证恢复完再判，否则刷新页面时 user 还是 null，会被误踢去登录页
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchMessages()
  }, [user, authLoading])

  // 新消息（订单状态变更、收款待办）要自己冒出来，不用用户反复进出页面
  useAutoRefresh(() => fetchMessages(true), 15000, !authLoading && !!user)

  const fetchMessages = async (silent = false) => {
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      setList(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (err) { console.error(err) }
    // 轮询时不闪骨架屏：否则整页每 15 秒抖一下
    if (!silent) setLoading(false)
  }

  const markAllRead = async () => {
    if (!unreadCount) return
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      })
      setList(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) { console.error(err) }
  }

  const openMessage = async (n: any) => {
    if (!n.read) {
      // 先本地置灰再发请求，避免等接口回来才变色
      setList(prev => prev.map(m => (m.id === n.id ? { ...m, read: true } : m)))
      setUnreadCount(prev => Math.max(0, prev - 1))
      fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] })
      }).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="h-8 skeleton w-1/3" />
        {[1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="page-container pt-4 pb-20 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold text-text-primary">
          🔔 消息中心
          {unreadCount > 0 && <span className="ml-2 text-xs font-normal text-primary-500">{unreadCount} 条未读</span>}
        </h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs px-3 py-1.5 rounded-full border border-warm-200 text-text-secondary">
            全部已读
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔔</div>
          <p className="text-text-light">暂无消息</p>
          <Link href="/" className="btn-primary inline-block mt-4 text-sm">去逛逛</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(n => (
            <div
              key={n.id}
              onClick={() => openMessage(n)}
              className={`card flex gap-3 cursor-pointer ${n.read ? '' : 'border-primary-200 bg-primary-50/40'}`}
            >
              <span className="text-xl flex-shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{n.title}</p>
                  {!n.read && <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />}
                </div>
                {n.content && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{n.content}</p>}
                <p className="text-[10px] text-text-light mt-1.5">{formatDate(n.createdAt)}</p>
              </div>
              {n.link && <span className="text-text-light self-center flex-shrink-0">›</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
