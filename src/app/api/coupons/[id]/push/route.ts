import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { grantCouponsToUsers } from '@/lib/coupons'

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
 * 也不受 `perUserLimit` 与各项限领规则限制——那些是用户自助领取的上限，店主主动赠送不受此约束。
 *
 * 隐藏券（visible=false）**照推不误**：隐藏的用意就是「只让店主发」，不是「这张券作废」。
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

    // 发券三件事（券 + 站内消息 + claimed 计数）与会员卡自动推送共用同一份实现
    await prisma.$transaction(async tx => {
      await grantCouponsToUsers(
        tx,
        members.map(m => m.id),
        [coupon]
      )
    })

    return NextResponse.json({ success: true, sent: members.length })
  } catch (error: any) {
    console.error('Push coupon error:', error)
    return NextResponse.json({ error: error.message || '推送失败' }, { status: 500 })
  }
}
