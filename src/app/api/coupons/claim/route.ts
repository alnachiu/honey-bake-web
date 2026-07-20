import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const { couponId } = await request.json()

    if (!couponId) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 })
    }

    // 检查优惠券
    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
    if (!coupon) {
      return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })
    }

    // 检查是否已领取
    const existing = await prisma.userCoupon.findFirst({
      where: { userId: user.id, couponId }
    })
    if (existing) {
      return NextResponse.json({ error: '已领取过该优惠券' }, { status: 400 })
    }

    // 检查库存
    if (coupon.stock > 0 && coupon.claimed >= coupon.stock) {
      return NextResponse.json({ error: '优惠券已领完' }, { status: 400 })
    }

    // 领取
    await prisma.userCoupon.create({
      data: { userId: user.id, couponId, status: 'active' }
    })

    await prisma.coupon.update({
      where: { id: couponId },
      data: { claimed: { increment: 1 } }
    })

    return NextResponse.json({ success: true })
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

    const coupons = userCoupons.map(uc => ({
      ...uc.coupon,
      status: uc.status,
      claimTime: uc.claimTime,
      useTime: uc.useTime
    }))

    return NextResponse.json({ coupons })
  } catch (error) {
    return NextResponse.json({ error: '获取我的优惠券失败' }, { status: 500 })
  }
}
