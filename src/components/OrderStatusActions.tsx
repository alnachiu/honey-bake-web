'use client'

import { useState } from 'react'

/**
 * 订单状态的操作按钮组（**店主专用**）。
 *
 * 抽成组件是因为订单管理列表和订单详情页要用同一套状态机——各抄一份的结果
 * 是迟早只改一处，两个入口能做的事不一样。后台 /admin/orders 里那份是独立实现，
 * 正在用、没坏，本轮不动它。
 *
 * 权限和状态机全在服务端（src/app/api/orders/[id]/route.ts）：管理员可改任意人的单，
 * 改完会给买家发站内通知，按目标状态写 payTime/deliveryTime/completeTime/cancelTime。
 * 所以这里只负责发 PUT、把成功与否告诉调用方，不自己判断权限。
 *
 * 注意：**不要把这个组件放进 <Link> 里**。里面的单号输入框一旦被包在链接中，
 * 点击/输入会冒泡到外层锚点触发跳转（列表页为此把卡片拆成「信息区是链接、
 * 操作区在链接外」，而不是靠 preventDefault 打补丁）。
 */

interface Props {
  order: { id: string; status: string; trackingNo?: string | null }
  /** 操作成功后回调：接口只回 { success: true }，列表要自己重拉 */
  onDone?: () => void
  /** 详情页底部固定条用 full，列表卡片里用 compact */
  size?: 'compact' | 'full'
}

export default function OrderStatusActions({ order, onDone, size = 'compact' }: Props) {
  // 发货时才展开的单号输入框。状态放组件内部、以 order.id 为键，
  // 这样 15 秒轮询重渲染不会把店主正在输入的单号清掉。
  const [shipping, setShipping] = useState(false)
  const [trackingNo, setTrackingNo] = useState(order.trackingNo || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = async (status: string, extra?: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(extra || {}) })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || '操作失败，请重试')
      } else {
        setShipping(false)
        onDone?.()
      }
    } catch {
      setError('网络异常，请重试')
    }
    setBusy(false)
  }

  const cancel = () => {
    if (confirm('确定取消这一单吗？取消后买家会收到通知。')) update('cancelled')
  }

  // 已经录入过单号就别再让输入框空着
  const trackingInput = (
    <div className={size === 'full' ? 'flex gap-2 w-full' : 'flex gap-2 mt-2'}>
      <input
        type="text"
        value={trackingNo}
        onChange={e => setTrackingNo(e.target.value)}
        placeholder="物流单号（可留空）"
        className="flex-1 min-w-0 px-3 py-2 rounded-full border border-warm-300 text-xs bg-white"
      />
      <button
        onClick={() => update('delivering', { trackingNo })}
        disabled={busy}
        className="px-4 py-2 rounded-full bg-primary-500 text-white text-xs disabled:opacity-60"
      >
        {busy ? '提交中' : '提交'}
      </button>
    </div>
  )

  const btnBase = size === 'full'
    ? 'flex-1 py-2.5 rounded-full text-sm'
    : 'flex-1 py-2 rounded-full text-xs'
  const btnPrimary = `${btnBase} bg-gradient-to-r from-primary-500 to-primary-400 text-white`
  const btnGhost = `${btnBase} border border-warm-300 text-text-secondary`

  const actions = (() => {
    switch (order.status) {
      case 'pending':
        return (
          <>
            <button onClick={cancel} disabled={busy} className={btnGhost}>取消</button>
            <button onClick={() => update('paid')} disabled={busy} className={btnPrimary}>💰 确认收款</button>
          </>
        )
      case 'paid':
        return (
          <>
            <button onClick={cancel} disabled={busy} className={btnGhost}>取消</button>
            <button onClick={() => setShipping(!shipping)} disabled={busy} className={btnPrimary}>
              🚚 {shipping ? '收起' : '发货'}
            </button>
          </>
        )
      case 'making':
        return <button onClick={() => update('delivering')} disabled={busy} className={btnPrimary}>🚚 开始配送</button>
      case 'delivering':
        return (
          <>
            <button onClick={() => setShipping(!shipping)} disabled={busy} className={btnGhost}>
              {order.trackingNo ? '改单号' : '录入单号'}
            </button>
            <button onClick={() => update('completed')} disabled={busy} className={btnPrimary}>📦 完成配送</button>
          </>
        )
      default:
        return null
    }
  })()

  if (!actions) return null

  return (
    <div className={size === 'full' ? 'w-full' : 'mt-3'}>
      <div className="flex gap-2">{actions}</div>
      {shipping && trackingInput}
      {error && <p className="text-[11px] text-red-500 mt-1.5">{error}</p>}
    </div>
  )
}
