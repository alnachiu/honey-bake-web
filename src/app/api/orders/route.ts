import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { generateOrderNo, calcOrderAmount, giftFromCoupon } from '@/lib/utils'
import { resolveUserCoupons } from '@/lib/coupons'
import { getMemberDiscountRate } from '@/lib/membership'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // Auto-complete orders in 'delivering' status older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await prisma.order.updateMany({
      where: {
        status: 'delivering',
        updatedAt: { lte: sevenDaysAgo }
      },
      data: { status: 'completed', completeTime: new Date() }
    })

    const where: any = user.role === 'admin' ? {} : { userId: user.id }
    if (status) where.status = status

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: true, address: true }
    })

    return NextResponse.json({ orders })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取订单失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json()

    if (!data.items || !data.items.length) {
      return NextResponse.json({ error: '订单不能为空' }, { status: 400 })
    }

    // 计算商品金额
    let itemsAmount = 0
    const orderItems = data.items.map((item: any) => {
      const amount = item.price * item.quantity
      itemsAmount += amount
      return {
        productId: item.productId,
        name: item.name,
        image: item.image || '',
        price: item.price,
        quantity: item.quantity,
        unit: item.unit || '份'
      }
    })

    // 校验并计算优惠券（归属 / 有效期 / 叠加规则 / 买赠券的硬规则）。
    // 传的是 UserCoupon.id（用户券包中那一张），不是券模板 id。
    const userCouponIds: string[] = Array.isArray(data.userCouponIds) ? data.userCouponIds : []

    // hasNormalItems：订单里有没有正常商品。买赠券的硬规则靠它判，
    // 不能用 itemsAmount > 0 代替——0 元商品的订单金额也是 0。
    // 上面的「订单不能为空」已经保证了非空，这里显式传下去是为了让规则本身
    // 不依赖那个前置校验（哪天校验放松了，买赠券的拦截还在）。
    const resolved = await resolveUserCoupons(user.id, userCouponIds, itemsAmount, orderItems.length > 0)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    // 赠品由**服务端**按券上配置的赠品名与数量推导，不接受前端传：
    // 这个路由对商品价格/名称是全信前端的，赠品再让前端传就等于白送任意东西。
    // 买赠券一次最多一张（resolveUserCoupons 已拦），所以取第一个就够。
    const gift = giftFromCoupon(resolved.coupons.find(c => c.type === 'gift'))

    // 会员折扣率只在有效期内生效；非会员恒为 1（不打折）
    const memberDiscountRate = await getMemberDiscountRate(user.memberExpire)

    // 金额统一由 calcOrderAmount 计算，与结算页共用同一套规则（先券后会员、运费按原价判断）
    const { couponDiscount, memberDiscount, deliveryFee, totalAmount } = calcOrderAmount({
      itemsAmount,
      coupons: resolved.coupons,
      memberDiscountRate
    })

    // 核销优惠券与创建订单放在同一事务：下单失败时券自动回滚，不会被白白烧掉
    const order = await prisma.$transaction(async tx => {
      if (resolved.coupons.length) {
        await tx.userCoupon.updateMany({
          where: {
            id: { in: resolved.coupons.map(c => c.userCouponId) },
            userId: user.id,
            status: 'active'
          },
          data: { status: 'used', useTime: new Date() }
        })
      }

      // 处理地址
      let addressId = data.addressId || null
      if (data.address && !addressId) {
        const addr = await tx.address.create({
          data: {
            userId: user.id,
            name: data.address.name,
            phone: data.address.phone,
            region: data.address.region || '',
            detail: data.address.detail,
            isDefault: false
          }
        })
        addressId = addr.id
      }

      return tx.order.create({
        data: {
          orderNo: generateOrderNo(),
          userId: user.id,
          items: { create: orderItems },
          totalAmount,
          deliveryFee,
          itemsAmount,
          couponDiscount,
          memberDiscount,
          // 随单配送的赠品，不参与金额计算（itemsAmount / totalAmount 都不含它）
          giftName: gift?.giftName || '',
          giftQuantity: gift?.giftQuantity || 0,
          remark: data.remark || '',
          addressId,
          status: 'pending'
        },
        include: { items: true }
      })
    })

    return NextResponse.json({ order })
  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json({ error: error.message || '创建订单失败' }, { status: 500 })
  }
}
