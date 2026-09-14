import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { todayStr } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const { couponId } = await request.json()

    if (!couponId) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
    if (!coupon) {
      return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })
    }

    // 有效期校验——此前缺失，直接调接口可领到已过期/未开始的券
    if (coupon.status !== 'active') {
      return NextResponse.json({ error: '该优惠券已停止发放' }, { status: 400 })
    }
    const dateStr = todayStr()
    if (dateStr < coupon.startTime) {
      return NextResponse.json({ error: '该优惠券还未开始发放' }, { status: 400 })
    }
    if (dateStr > coupon.endTime) {
      return NextResponse.json({ error: '该优惠券已过期' }, { status: 400 })
    }

    // 库存校验
    if (coupon.stock > 0 && coupon.claimed >= coupon.stock) {
      return NextResponse.json({ error: '优惠券已领完' }, { status: 400 })
    }

    // 每人限领校验（perUserLimit = 0 表示不限量）
    const myCount = await prisma.userCoupon.count({ where: { userId: user.id, couponId } })
    if (coupon.perUserLimit > 0 && myCount >= coupon.perUserLimit) {
      return NextResponse.json(
        { error: `每人最多可领取 ${coupon.perUserLimit} 张，您已领完` },
        { status: 400 }
      )
    }

    // 领取与计数自增放在同一事务，避免计数漂移
    await prisma.$transaction([
      prisma.userCoupon.create({
        data: { userId: user.id, couponId, status: 'active' }
      }),
      prisma.coupon.update({
        where: { id: couponId },
        data: { claimed: { increment: 1 } }
      })
    ])

    const claimedNow = myCount + 1
    return NextResponse.json({
      success: true,
      myClaimCount: claimedNow,
      remainForMe: coupon.perUserLimit > 0 ? Math.max(0, coupon.perUserLimit - claimedNow) : -1
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '领取失败' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const userCoupons = await prisma.userCoupon.findMany({
      where: { userId: user.id },
      include: { coupon: true },
      orderBy: { claimTime: 'desc' }
    })

    // userCouponId 用于下单时精确核销单张券
    // （此前按 userId+couponId 批量 updateMany，会把同一张券的所有副本一次烧光）
    const coupons = userCoupons.map(uc => ({
      ...uc.coupon,
      userCouponId: uc.id,
      status: uc.status,
      claimTime: uc.claimTime,
      useTime: uc.useTime
    }))

    return NextResponse.json({ coupons })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取我的优惠券失败' }, { status: 500 })
  }
}
