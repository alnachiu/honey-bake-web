import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { todayStr } from '@/lib/utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all')

    // 管理员查看全部：附带领取/使用统计，供删除前展示影响面
    if (all === 'true') {
      const user = await getAuthUser()
      if (user?.role === 'admin') {
        const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } })

        const grouped = await prisma.userCoupon.groupBy({
          by: ['couponId', 'status'],
          _count: { _all: true }
        })
        const claimCount: Record<string, number> = {}
        const usedCount: Record<string, number> = {}
        for (const g of grouped) {
          claimCount[g.couponId] = (claimCount[g.couponId] || 0) + g._count._all
          if (g.status === 'used') usedCount[g.couponId] = g._count._all
        }

        return NextResponse.json({
          coupons: coupons.map(c => ({
            ...c,
            claimCount: claimCount[c.id] || 0,
            usedCount: usedCount[c.id] || 0
          }))
        })
      }
    }

    // 用户查看可领取的
    const user = await getAuthUser()
    const dateStr = todayStr()

    const coupons = await prisma.coupon.findMany({
      where: {
        status: 'active',
        startTime: { lte: dateStr },
        endTime: { gte: dateStr }
      },
      orderBy: { createdAt: 'desc' }
    })

    // 当前用户已领数量，供前端展示「已领 x/y」并置灰按钮
    let myClaimCount: Record<string, number> = {}
    if (user) {
      const grouped = await prisma.userCoupon.groupBy({
        by: ['couponId'],
        where: { userId: user.id },
        _count: { _all: true }
      })
      myClaimCount = Object.fromEntries(grouped.map(g => [g.couponId, g._count._all]))
    }

    return NextResponse.json({
      coupons: coupons.map(c => {
        const mine = myClaimCount[c.id] || 0
        const soldOut = c.stock > 0 && c.claimed >= c.stock
        const reachedLimit = c.perUserLimit > 0 && mine >= c.perUserLimit
        return {
          ...c,
          myClaimCount: mine,
          soldOut,
          reachedLimit,
          // 还能再领几张（-1 表示不限量）
          remainForMe: c.perUserLimit > 0 ? Math.max(0, c.perUserLimit - mine) : -1
        }
      })
    })
  } catch (error: any) {
    console.error('Get coupons error:', error)
    return NextResponse.json({ error: error.message || '获取优惠券失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const data = await request.json()

    const name = String(data.name || '').trim()
    const type = data.type === 'discount' ? 'discount' : 'reduce'
    const value = parseFloat(data.value)
    const minAmount = parseFloat(data.minAmount || '0')
    const stock = parseInt(data.stock ?? '0', 10)
    const perUserLimit = parseInt(data.perUserLimit ?? '1', 10)
    const stackable = data.stackable === true
    const startTime = String(data.startTime || '')
    const endTime = String(data.endTime || '')

    // 校验
    if (!name) return NextResponse.json({ error: '请填写优惠券名称' }, { status: 400 })
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: '优惠额度必须大于 0' }, { status: 400 })
    }
    if (type === 'discount' && value >= 10) {
      return NextResponse.json({ error: '折扣力度需小于 10 折（如 9 表示九折）' }, { status: 400 })
    }
    if (!Number.isFinite(minAmount) || minAmount < 0) {
      return NextResponse.json({ error: '最低消费不能为负数' }, { status: 400 })
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return NextResponse.json({ error: '库存不能为负数' }, { status: 400 })
    }
    if (!Number.isInteger(perUserLimit) || perUserLimit < 0) {
      return NextResponse.json({ error: '每人限领数量不能为负数' }, { status: 400 })
    }
    if (!startTime || !endTime) {
      return NextResponse.json({ error: '请选择开始和结束时间' }, { status: 400 })
    }
    if (startTime > endTime) {
      return NextResponse.json({ error: '开始时间不能晚于结束时间' }, { status: 400 })
    }

    const coupon = await prisma.coupon.create({
      data: {
        name,
        type,
        value,
        minAmount,
        stock,
        perUserLimit,
        stackable,
        startTime,
        endTime,
        description: String(data.description || '')
      }
    })

    return NextResponse.json({ coupon })
  } catch (error: any) {
    console.error('Create coupon error:', error)
    return NextResponse.json({ error: error.message || '创建优惠券失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()

    // 兼容 body 与 query 两种传参
    let id = new URL(request.url).searchParams.get('id') || ''
    if (!id) {
      try {
        id = (await request.json())?.id || ''
      } catch {
        /* body 为空时忽略 */
      }
    }
    if (!id) {
      return NextResponse.json({ error: '缺少优惠券 id' }, { status: 400 })
    }

    const coupon = await prisma.coupon.findUnique({ where: { id } })
    if (!coupon) {
      return NextResponse.json({ error: '优惠券不存在或已被删除' }, { status: 404 })
    }

    // 用户已领取的记录需一并回收。UserCoupon -> Coupon 有外键约束，
    // 不先清理会直接抛 P2003 导致删除失败（这正是此前「删不掉」的原因）。
    const removedClaims = await prisma.userCoupon.count({ where: { couponId: id } })

    await prisma.$transaction([
      prisma.userCoupon.deleteMany({ where: { couponId: id } }),
      prisma.coupon.delete({ where: { id } })
    ])

    return NextResponse.json({ success: true, removedClaims })
  } catch (error: any) {
    console.error('Delete coupon error:', error)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
