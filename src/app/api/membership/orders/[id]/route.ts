import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { extendMemberExpire, formatDate } from '@/lib/utils'
import { grantCouponsToUsers, isCouponInWindow } from '@/lib/coupons'

/**
 * 管理员处理会员卡购买单：
 *   action = 'confirm' 确认收款 → 开通/续期
 *   action = 'cancel'  取消订单 → 不延长会员
 */
export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const body = (await request.json()) as { id?: string; action?: string }
    const orderId = String(body?.id || '')
    if (!orderId) return NextResponse.json({ error: '缺少订单 id' }, { status: 400 })

    const action = body?.action === 'cancel' ? 'cancel' : 'confirm'

    const order = await prisma.membershipOrder.findUnique({
      where: { id: orderId },
      include: { plan: { select: { name: true } } }
    })
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    if (order.status !== 'pending') {
      return NextResponse.json({ error: '该订单已处理，请勿重复操作' }, { status: 400 })
    }

    if (action === 'cancel') {
      const cancelled = await prisma.membershipOrder.update({
        where: { id: orderId },
        data: { status: 'cancelled' }
      })
      return NextResponse.json({ order: cancelled })
    }

    const result = await prisma.$transaction(async tx => {
      // 再次读取用户当前到期时间：以事务内的值为准，避免并发确认时互相覆盖
      const target = await tx.user.findUnique({
        where: { id: order.userId },
        select: { memberExpire: true }
      })
      if (!target) throw new Error('用户不存在')

      // 未到期续费为叠加，已过期则从当下重新起算
      const newExpire = extendMemberExpire(target.memberExpire, order.days)

      const updatedOrder = await tx.membershipOrder.update({
        where: { id: orderId },
        data: { status: 'paid', payTime: new Date() }
      })
      const updatedUser = await tx.user.update({
        where: { id: order.userId },
        data: { memberExpire: newExpire }
      })
      await tx.notification.create({
        data: {
          userId: order.userId,
          title: '会员已开通',
          content: `「${order.planName}」已生效，会员有效期至 ${formatDate(newExpire)}`,
          type: 'member',
          link: '/member'
        }
      })

      // 会员卡绑定的赠券自动到账。
      // 只推「还在发放期」的券：套餐绑定是长期配置，绑的券可能早就下架或过了有效期，
      // 那种券推过去也用不了，不如不推。一张都没有就安静跳过。
      // 放在同一个事务里 —— 开通与发券要么都成、要么都不成。
      const bound = await tx.membershipPlanCoupon.findMany({
        where: { planId: order.planId },
        include: { coupon: true }
      })
      const pushable = bound
        .map(b => b.coupon)
        .filter(c => c.status === 'active' && isCouponInWindow(c))

      // 按店主的要求续费也发、不去重：每次确认收款都再发一遍
      const { perUser: pushedCoupons } = await grantCouponsToUsers(
        tx,
        [order.userId],
        pushable
      )

      return { order: updatedOrder, memberExpire: updatedUser.memberExpire, pushedCoupons }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Confirm membership order error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}
