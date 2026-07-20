import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { generateOrderNo, calcDiscount } from '@/lib/utils'

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

    // 计算配送费
    const deliveryFee = itemsAmount >= 68 ? 0 : 5

    // 计算优惠券折扣
    let couponDiscount = 0
    if (data.couponId) {
      const coupon = await prisma.coupon.findUnique({ where: { id: data.couponId } })
      if (coupon && coupon.status === 'active') {
        const result = calcDiscount(itemsAmount, { type: coupon.type, value: coupon.value, minAmount: coupon.minAmount })
        couponDiscount = result.discount
        // 标记优惠券已使用
        await prisma.userCoupon.updateMany({
          where: { userId: user.id, couponId: data.couponId, status: 'active' },
          data: { status: 'used', useTime: new Date() }
        })
      }
    }

    // 处理地址
    let addressId = data.addressId || null
    if (data.address && !addressId) {
      const addr = await prisma.address.create({
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

    const totalAmount = Math.max(0, itemsAmount + deliveryFee - couponDiscount)

    const order = await prisma.order.create({
      data: {
        orderNo: generateOrderNo(),
        userId: user.id,
        items: { create: orderItems },
        totalAmount,
        deliveryFee,
        itemsAmount,
        couponDiscount,
        remark: data.remark || '',
        addressId,
        status: 'pending'
      },
      include: { items: true }
    })

    return NextResponse.json({ order })
  } catch (error: any) {
    console.error('Create order error:', error)
    return NextResponse.json({ error: error.message || '创建订单失败' }, { status: 500 })
  }
}
