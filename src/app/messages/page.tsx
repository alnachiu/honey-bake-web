'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { formatDate } from '@/lib/utils'
import { useLongPress, LONG_PRESS_STYLE } from '@/hooks/useLongPress'

const TYPE_ICON: Record<string, string> = {
  coupon: '🎫',
  member: '💎',
  order: '📋',
  // 站内聊天的来消息提醒（顾客发给店主 / 店主回复顾客）
  chat: '💬',
  system: '🔔'
}

/**
 * 单条通知。抽成组件是因为长按要用 hook，而 hook 不能写在 map 循环里。
 */
function NotificationItem({ n, onOpen, onDelete }: { n: any; onOpen: (n: any) => void; onDelete: (n: any) => void }) {
  // 长按 = 删除。确认框用系统原生 confirm，与后台其它危险操作保持一致
  // （见 admin/coupons/page.tsx），且文案把影响面写清楚。
  const longPress = useLongPress(() => onDelete(n))

  return (
    <div
      {...longPress}
      onClick={() => onOpen(n)}
      style={LONG_PRESS_STYLE}
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
  )
}

/** 会话列表接口返回的未读数：聊天有独立的未读口径，与通知的未读不是一回事 */
function ChatEntryCard({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Link href="/chat" className="card mb-3 flex items-center gap-3 border-primary-200 bg-primary-50/40">
      <span className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-lg flex-shrink-0">💬</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{isAdmin ? '顾客消息' : '联系店主'}</p>
        <p className="text-xs text-text-light mt-0.5">
          {isAdmin ? '顾客通过「联系小二」发来的消息' : '有问题直接找店主，随时可以聊'}
        </p>
      </div>
      <span className="text-text-light flex-shrink-0">›</span>
    </Link>
  )
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

  /** 长按删除单条通知。通知是按用户隔离的，删掉就是真删 */
  const deleteMessage = async (n: any) => {
    if (!confirm(`删除这条消息？\n\n「${n.title}」\n\n删除后无法恢复。`)) return

    // 先本地移除：列表每 15 秒轮询刷新一次，等接口回来再动会有明显的回弹感
    setList(prev => prev.filter(m => m.id !== n.id))
    const wasUnread = !n.read
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1))

    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] })
      })
      const data = await res.json()
      // 未读数以服务端为准：本地只做了乐观减法，并发情况下可能不准
      if (typeof data?.unreadCount === 'number') setUnreadCount(data.unreadCount)
      else if (!res.ok) fetchMessages(true)
    } catch (err) {
      console.error(err)
      // 请求失败就把列表拉回真实状态，别让界面显示成「已删除」而库里还在
      fetchMessages(true)
    }
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

      {/* 找店主的入口。消息中心是用户遇到问题时最先点进来的地方，
          把聊天入口放在这儿，比只藏在订单页的按钮里更容易被找到 */}
      <ChatEntryCard isAdmin={user.role === 'admin'} />

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
            <NotificationItem key={n.id} n={n} onOpen={openMessage} onDelete={deleteMessage} />
          ))}
        </div>
      )}
    </div>
  )
}
