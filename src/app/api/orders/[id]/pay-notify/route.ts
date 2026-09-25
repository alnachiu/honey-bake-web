import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notify'

/**
 * 消费者点击「已扫码支付」后调用。
 *
 * 只记「用户声明已转账」并发通知给店主，**不动订单状态**——
 * 钱到没到只有店主能看到，订单能否算已付款由店主在后台确认。
 * 此前消费者点这个按钮会直接把 status 改成 paid（现在被 403 拦下，
 * 表现为点了没反应），等于让买家自己宣布收款，与真实资金流脱节。
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true, orderNo: true, userId: true, status: true,
        totalAmount: true, payClaimedAt: true
      }
    })

    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }
    // 只能声明自己的订单；没有管理员代点这一说
    if (order.userId !== user.id) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ error: '该订单已处理，无需重复通知' }, { status: 400 })
    }

    // 把 payClaimedAt: null 写进 WHERE，用条件更新换原子性与幂等性：
    // 用户连点或并发请求时，只有一个能拿到 count=1，另一个拿到 0。
    // 若改成「先查再更新」，两边都会读到 null，店主就会收到两条重复通知。
    const result = await prisma.$transaction(async tx => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, userId: user.id, status: 'pending', payClaimedAt: null },
        data: { payClaimedAt: new Date() }
      })
      if (count === 0) return { alreadyNotified: true, notified: 0 }

      const notified = await notifyAdmins(tx, {
        title: '💰 顾客已扫码支付，待确认收款',
        content: `订单 #${order.orderNo.slice(-8)} · 顾客声明已付款 ¥${order.totalAmount.toFixed(2)}，请核对到账后确认收款`,
        type: 'order',
        link: `/admin/orders?orderId=${order.id}`
      })
      return { alreadyNotified: false, notified }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Order pay-notify error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}
