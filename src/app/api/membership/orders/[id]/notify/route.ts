import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notify'

/**
 * 消费者在会员卡付款弹窗点「我已付款」后调用。
 *
 * 同样只做「声明 + 通知店主」，不碰订单状态、更不碰会员期：
 * 开卡与发券仍由店主在后台点「确认收款」触发
 * （见 src/app/api/membership/orders/[id]/route.ts）。
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()

    const order = await prisma.membershipOrder.findUnique({
      where: { id: params.id },
      select: {
        id: true, orderNo: true, userId: true, status: true,
        planName: true, days: true, price: true, payClaimedAt: true
      }
    })

    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }
    if (order.userId !== user.id) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ error: '该订单已处理，无需重复通知' }, { status: 400 })
    }

    // 同 /api/orders/[id]/pay-notify：条件更新保证并发下只通知一次
    const result = await prisma.$transaction(async tx => {
      const { count } = await tx.membershipOrder.updateMany({
        where: { id: order.id, userId: user.id, status: 'pending', payClaimedAt: null },
        data: { payClaimedAt: new Date() }
      })
      if (count === 0) return { alreadyNotified: true, notified: 0 }

      const notified = await notifyAdmins(tx, {
        title: '💰 会员卡待确认收款',
        content: `${user.name || '顾客'} 声明已付款「${order.planName}」（${order.days} 天 / ¥${order.price.toFixed(2)}），订单 #${order.orderNo.slice(-8)}，请核对到账后开通`,
        type: 'member',
        link: `/admin/membership?orderId=${order.id}`
      })
      return { alreadyNotified: false, notified }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Membership pay-notify error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}
