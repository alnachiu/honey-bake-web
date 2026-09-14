import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { userCouponExpireAt } from '@/lib/coupons'

/** GET：预览会推送给多少人（发送前让店主确认影响面） */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()

    const coupon = await prisma.coupon.findUnique({ where: { id: params.id } })
    if (!coupon) return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })

    const memberCount = await prisma.user.count({
      where: { memberExpire: { gt: new Date() } }
    })

    return NextResponse.json({ memberCount, coupon })
  } catch (error: any) {
    console.error('Preview push error:', error)
    return NextResponse.json({ error: error.message || '获取会员人数失败' }, { status: 500 })
  }
}

/**
 * 把某张优惠券推送给全部在期会员。
 *
 * 按店主的要求**不去重**：已持有同一张券的会员照发一份，因此重复推送会拿到多张。
 * 也不受 `perUserLimit` 限制——那是用户自助领取的上限，店主主动赠送不受此约束。
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()

    const coupon = await prisma.coupon.findUnique({ where: { id: params.id } })
    if (!coupon) return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })

    const members = await prisma.user.findMany({
      where: { memberExpire: { gt: new Date() } },
      select: { id: true }
    })

    if (!members.length) {
      return NextResponse.json({ success: true, sent: 0, message: '当前没有在期会员' })
    }

    const now = new Date()
    // 同一批推送共用同一个到期时刻，避免循环里逐条 new Date() 造成毫秒级差异
    const expireTime = userCouponExpireAt(coupon, now)

    await prisma.$transaction(async tx => {
      await tx.userCoupon.createMany({
        data: members.map(m => ({
          userId: m.id,
          couponId: coupon.id,
          status: 'active',
          source: 'push',
          claimTime: now,
          expireTime
        }))
      })

      // 券包自动到账 + 站内消息红点，两条路都走
      await tx.notification.createMany({
        data: members.map(m => ({
          userId: m.id,
          title: '收到一张会员专属优惠券',
          content: `${coupon.name}：${coupon.type === 'discount' ? `${coupon.value} 折` : `满 ${coupon.minAmount} 减 ${coupon.value}`}，已放入你的券包`,
          type: 'coupon',
          link: '/coupons'
        }))
      })

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { claimed: { increment: members.length } }
      })
    })

    return NextResponse.json({ success: true, sent: members.length })
  } catch (error: any) {
    console.error('Push coupon error:', error)
    return NextResponse.json({ error: error.message || '推送失败' }, { status: 500 })
  }
}
