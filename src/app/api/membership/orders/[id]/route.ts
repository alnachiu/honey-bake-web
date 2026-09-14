import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { extendMemberExpire, formatDate } from '@/lib/utils'

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

      return { order: updatedOrder, memberExpire: updatedUser.memberExpire }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Confirm membership order error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}
