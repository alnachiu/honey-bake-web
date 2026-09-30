'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { formatDate } from '@/lib/utils'
import { useLongPress, LONG_PRESS_STYLE } from '@/hooks/useLongPress'

/**
 * 一条消息气泡。抽成组件是为了挂长按 hook——hook 不能写在 map 循环里。
 * 长按整段对话里的任意一条，就把这段对话从**自己这边**清掉。
 */
function MessageBubble({ m, mine, onLongPress }: { m: any; mine: boolean; onLongPress: () => void }) {
  const longPress = useLongPress(onLongPress)
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        {...longPress}
        style={LONG_PRESS_STYLE}
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
          mine ? 'bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-br-md'
               : 'bg-white border border-warm-200 text-text-primary rounded-bl-md'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
        <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-text-light'}`}>
          {formatDate(m.createdAt)}
        </p>
      </div>
    </div>
  )
}

/** 店主侧会话列表里的一行。长按 = 把这段对话从店主这边清掉 */
function ConversationRow({ c, onOpen, onClear }: { c: any; onOpen: (c: any) => void; onClear: (c: any) => void }) {
  const longPress = useLongPress(() => onClear(c))
  return (
    <button
      {...longPress}
      onClick={() => onOpen(c)}
      style={LONG_PRESS_STYLE}
      className="card w-full text-left flex gap-3 items-start"
    >
      <span className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 text-lg">👤</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
          {c.unread > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white flex-shrink-0">
              {c.unread}
            </span>
          )}
          <span className="text-[10px] text-text-light ml-auto flex-shrink-0">{formatDate(c.lastMessageAt)}</span>
        </div>
        <p className="text-xs text-text-light mt-0.5">{c.phone}</p>
        <p className="text-xs text-text-secondary mt-1 truncate">
          {/* 标出最后一条是谁说的：店主一眼知道该轮到自己回了 */}
          {c.lastMessageRole === 'admin' ? '我：' : ''}{c.lastMessage}
        </p>
      </div>
    </button>
  )
}

/**
 * 「联系小二」的聊天页。
 *
 * 一个页面按角色分叉，而不是做成两个页面：
 * 两边看到的是同一种东西（一个消息列表 + 一个输入框），差别只在
 * 店主先看到会话列表、以及气泡左右相反。拆成两个页面会让这段拉取/发送/
 * 标记已读的逻辑抄两遍，迟早改一处漏一处。
 */
export default function ChatPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [expireAt, setExpireAt] = useState<string | null>(null)
  const [retentionDays, setRetentionDays] = useState(7)
  // 店主侧
  const [conversations, setConversations] = useState<any[]>([])
  const [peer, setPeer] = useState<any>(null)
  const [peerId, setPeerId] = useState('')

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  const isAdmin = user?.role === 'admin'
  const myRole = isAdmin ? 'admin' : 'user'
  // 会话是否已经打开（店主还没点进任何顾客时为 false，此时不该去标记已读）
  const inConversation = !isAdmin || !!peerId

  const bottomRef = useRef<HTMLDivElement>(null)
  // 从订单页跳进来时带的那句话只预填一次，之后用户自己清空不该被重新填上
  const prefilledRef = useRef(false)

  // 读 URL 参数。
  // 刻意不用 useSearchParams：项目里没有 <Suspense> 边界，
  // App Router 预渲染客户端页面时会报 missing-suspense-with-csr-bailout。
  useEffect(() => {
    if (!user || prefilledRef.current) return
    prefilledRef.current = true
    const sp = new URLSearchParams(window.location.search)

    const uid = sp.get('userId')
    // userId 只对店主有意义（店主从通知点进来直达某位顾客）
    if (uid && user.role === 'admin') setPeerId(uid)

    // 消费者从订单详情页的「联系小二」进来：把订单号预填进输入框。
    // 不直接替他发出去——他可能还想补一句别的话，替他发等于替他说话。
    const orderNo = sp.get('orderNo')
    if (orderNo && user.role !== 'admin') {
      setInput(`你好，我想咨询订单 #${String(orderNo).slice(-8)}，`)
    }
  }, [user])

  useEffect(() => {
    // 等认证恢复完再判：user 初值为 null，抢先判会把刷新页面的用户踢去登录页
    if (authLoading) return
    if (!user) { router.push('/login'); return }
    fetchChat()
  }, [user, authLoading, peerId])

  // 对方发的消息要自己冒出来。8 秒：比订单页的 10 秒密一点——
  // 聊天是有来有回的，等 15 秒才看到回复会让人以为对方没理他。
  useAutoRefresh(() => fetchChat(true), 8000, !authLoading && !!user && inConversation)

  const fetchChat = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const url = isAdmin && peerId ? `/api/chat?userId=${peerId}` : '/api/chat'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) { setToast(data.error || '加载失败'); return }

      const list = data.messages || []
      setMessages(list)
      setExpireAt(data.expireAt || null)
      setRetentionDays(data.retentionDays || 7)
      if (data.role === 'admin') {
        setConversations(data.conversations || [])
        if (data.peer) setPeer(data.peer)
      }

      // 对方发来的还没读过 → 告知服务端已读。
      // 标记完下一轮拉回来的 readAt 就有值了，不会每 8 秒重复请求。
      if (list.some((m: any) => m.senderRole !== myRole && !m.readAt)) {
        fetch('/api/chat', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isAdmin ? { userId: peerId } : {})
        }).catch(() => {})
      }
    } catch (err) { console.error(err) }
    // 轮询时不闪骨架屏：否则每 8 秒整页抖一下
    if (!silent) setLoading(false)
  }

  /**
   * 清空某段对话。**只清自己这边**，对方的记录一条不动——服务端是按角色
   * 给自己那侧的标记位打标（见 api/chat 的 DELETE），所以这里只管本地跟着变。
   */
  const clearChat = async (targetUserId: string, peerLabel: string) => {
    if (!confirm(
      `清空与${peerLabel}的全部聊天记录？\n\n` +
      `清空后只在你这边消失，对方仍能看到原来的消息。\n` +
      `你之后发新消息，这段对话会重新出现。`
    )) return

    try {
      const res = await fetch('/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // 店主必须指明清哪一位顾客；消费者的目标恒为自己，服务端会忽略这个字段
        body: JSON.stringify(isAdmin ? { userId: targetUserId } : {})
      })
      const data = await res.json()
      if (!res.ok) {
        setToast(data.error || '清空失败')
        setTimeout(() => setToast(''), 2500)
        return
      }

      // 本地立刻反映。等下一轮轮询（8 秒）的话，用户会以为长按没生效又去试一遍
      if (isAdmin) setConversations(prev => prev.filter(c => c.userId !== targetUserId))
      setMessages([])
    } catch (err) {
      setToast('网络异常，请重试')
      setTimeout(() => setToast(''), 2500)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAdmin ? { userId: peerId, body: text } : { body: text })
      })
      const data = await res.json()
      if (!res.ok) { setToast(data.error || '发送失败'); return }
      setInput('')
      await fetchChat(true)
    } catch (err) {
      setToast('网络异常，请重试')
    }
    setSending(false)
    setTimeout(() => setToast(''), 2500)
  }

  // 新消息进来后滚到底。依赖 messages.length 而不是 messages：
  // 数组引用每次拉取都是新的，挂在 messages 上会导致每 8 秒强行把用户
  // 从上面正在翻的历史里拽回底部。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, inConversation])

  if (authLoading) {
    return (
      <div className="page-container pt-4 space-y-3">
        <div className="h-12 skeleton rounded-2xl" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    )
  }
  if (!user) return null

  /** 临时通道的提醒条。双方都要一眼看到，所以常驻在消息区顶部，不随滚动消失 */
  const retentionBar = (
    <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
      <p className="text-[11px] text-amber-700 leading-relaxed">
        ⏳ 本对话为<strong>临时沟通</strong>，消息在最后一条消息发出 {retentionDays} 天后自动清除
        {expireAt ? `，本次将于 ${formatDate(expireAt)} 清除` : ''}。有需要长期保留的内容请另外截图保存。
      </p>
    </div>
  )

  /** 消息气泡。senderRole 与本端一致就靠右、上主色，否则靠左、浅底色 */
  const renderMessage = (m: any) => (
    <MessageBubble
      key={m.id}
      m={m}
      mine={m.senderRole === myRole}
      onLongPress={() => clearChat(isAdmin ? peerId : user.id, isAdmin ? (peer?.name || '这位顾客') : '店主')}
    />
  )

  /** 会话窗口（消费者和店主点进某位顾客后共用） */
  const chatWindow = (
    <>
      {retentionBar}

      <div className="px-4 py-3 space-y-3 pb-40">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 skeleton rounded-2xl" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-text-light text-sm">还没有消息</p>
            <p className="text-xs text-text-light mt-2 leading-relaxed">
              有什么想问的可以直接说，店主看到后会回复你
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}

        {/* 清除时刻在这里再写一遍：提醒条在顶部，翻到底部时已经滚出屏幕，
            而这正是用户刚读完、准备关掉对话的时刻 */}
        {messages.length > 0 && expireAt && (
          <p className="text-[10px] text-text-light text-center pt-2 leading-relaxed">
            以上消息将在 {formatDate(expireAt)} 自动清除
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入栏。放在底部导航之上（bottom-14 = 导航的 h-14），
          否则会把「主页/购物车/我的」整条盖住，用户聊完没法走 */}
      <div className="fixed bottom-14 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3 z-40">
        <div className="max-w-lg mx-auto flex gap-2 items-end">
          <input
            className="input-field text-sm flex-1"
            placeholder="输入消息…"
            maxLength={500}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // 回车即发送。用 Shift+Enter 换行的需求在这里不大（单行输入框），不额外做
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
            }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="btn-primary text-sm px-5 py-2.5 flex-shrink-0 disabled:opacity-50"
          >
            {sending ? '发送中' : '发送'}
          </button>
        </div>
      </div>
    </>
  )

  // 店主且还没选中顾客 → 会话列表
  if (isAdmin && !peerId) {
    return (
      <div className="page-container pt-4 pb-20 animate-fade-in">
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
            {toast}
          </div>
        )}

        <h1 className="text-lg font-bold text-text-primary mb-1">💬 顾客消息</h1>
        <p className="text-sm text-text-light mb-1">
          顾客从「联系小二」发来的消息都在这儿，闲置 {retentionDays} 天自动清除
        </p>
        <p className="text-xs text-text-light mb-4">长按某位顾客可以清空这段对话</p>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-text-light">还没有顾客发来消息</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map(c => (
              <ConversationRow
                key={c.id}
                c={c}
                onOpen={c => { setPeerId(c.userId); setPeer({ id: c.userId, name: c.name, phone: c.phone }) }}
                onClear={c => clearChat(c.userId, c.name)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white px-5 py-2.5 rounded-xl text-sm toast-enter">
          {toast}
        </div>
      )}

      <div className="px-4 pt-4 flex items-center gap-2">
        {isAdmin && (
          <button onClick={() => { setPeerId(''); setPeer(null); setMessages([]) }} className="text-sm text-text-secondary flex-shrink-0">
            ‹ 返回
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-text-primary truncate">
            {isAdmin ? `与 ${peer?.name || '顾客'} 的对话` : '💬 联系小二'}
          </h1>
          {isAdmin && peer?.phone && <p className="text-[10px] text-text-light">{peer.phone}</p>}
          {!isAdmin && <p className="text-[10px] text-text-light">长按消息可清空这段对话</p>}
        </div>
      </div>

      {chatWindow}
    </div>
  )
}
