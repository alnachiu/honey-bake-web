import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyAdmins } from '@/lib/notify'

/**
 * 消费者点击「已扫码支付」后调用。
 *
 * 这一步会**把订单推进到 paid（后台「待处理订单」统计的就是这一档）**并给店主发待办。
 * 店主那边不再需要单独点一次「确认收款」——顾客按完这个按钮，订单就直接落到
 * 店主的待处理队列里，店主核对到账后直接发货。
 *
 * `payClaimedAt` 仍然要记：它是「顾客自己声明付了」的唯一凭据，
 * 后台列表靠它提醒店主「这单的钱还没核对过」，也是这一单能被取消的依据。
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
    // 已经声明过的直接当成功返回。用户连点、或者从列表反复进详情页都会走到这里，
    // 报错只会让他以为没点上。
    if (order.payClaimedAt) {
      return NextResponse.json({ success: true, alreadyNotified: true, notified: 0 })
    }
    // 剩下的状态里只有 pending 能声明付款：店主已经确认过、或已发货/已完成/已取消的单
    // 都不该再被顾客改一次
    if (order.status !== 'pending') {
      return NextResponse.json({ error: '该订单已处理，无需重复通知' }, { status: 400 })
    }

    const now = new Date()

    // 把 payClaimedAt: null 写进 WHERE，用条件更新换原子性与幂等性：
    // 用户连点或并发请求时，只有一个能拿到 count=1，另一个拿到 0。
    // 若改成「先查再更新」，两边都会读到 null，店主就会收到两条重复通知。
    const result = await prisma.$transaction(async tx => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, userId: user.id, status: 'pending', payClaimedAt: null },
        // payTime 一并写上：订单现在就是「已付款待处理」，付款时间空着会让店主对不上账。
        // 这一档之后没有别的入口能再写 payTime（店主的「确认收款」按钮只出现在 pending）。
        data: { payClaimedAt: now, status: 'paid', payTime: now }
      })
      if (count === 0) return { alreadyNotified: true, notified: 0 }

      const notified = await notifyAdmins(tx, {
        title: '💰 顾客已扫码支付，待处理',
        content: `订单 #${order.orderNo.slice(-8)} · 顾客声明已付款 ¥${order.totalAmount.toFixed(2)}，请核对到账后发货`,
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
