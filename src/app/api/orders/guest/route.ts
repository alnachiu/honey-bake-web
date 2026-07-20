import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie, hashPassword } from '@/lib/auth'
import { generateOrderNo, calcDiscount } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const { name, phone, address, items, remark, couponId } = data

    if (!name || !phone) {
      return NextResponse.json({ error: '请填写姓名和手机号' }, { status: 400 })
    }
    if (!items || !items.length) {
      return NextResponse.json({ error: '订单不能为空' }, { status: 400 })
    }

    // 查找或创建用户
    let user = await prisma.user.findFirst({ where: { phone } })
    let isNewUser = false

    if (!user) {
      isNewUser = true
      const email = `wx_${phone}@honeybake.com`
      const randomPassword = Math.random().toString(36).slice(-10) + 'Ab1!'
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: await hashPassword(randomPassword),
          phone,
          role: 'user'
        }
      })
    }

    // 计算金额
    let itemsAmount = 0
    const orderItems = items.map((item: any) => {
      const amount = item.price * item.quantity
      itemsAmount += amount
      return {
        productId: item.id,
        name: item.name,
        image: item.image || '',
        price: item.price,
        quantity: item.quantity,
        unit: item.unit || '份',
        product: { connect: { id: item.id } }
      }
    })

    const deliveryFee = itemsAmount >= 68 ? 0 : 5
    let couponDiscount = 0
    if (couponId) {
      const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
      if (coupon && coupon.status === 'active') {
        const result = calcDiscount(itemsAmount, { type: coupon.type, value: coupon.value, minAmount: coupon.minAmount })
        couponDiscount = result.discount
        await prisma.userCoupon.updateMany({
          where: { userId: user.id, couponId, status: 'active' },
          data: { status: 'used', useTime: new Date() }
        })
      }
    }

    const totalAmount = Math.max(0, itemsAmount + deliveryFee - couponDiscount)

    // 创建地址
    const addr = await prisma.address.create({
      data: {
        userId: user.id,
        name,
        phone,
        region: address?.region || '',
        detail: address?.detail || address || '',
        isDefault: true
      }
    })

    // 创建订单
    const order = await prisma.order.create({
      data: {
        orderNo: generateOrderNo(),
        userId: user.id,
        itemsAmount,
        deliveryFee,
        couponDiscount,
        totalAmount,
        remark: remark || '',
        addressId: addr.id,
        status: 'pending',
        items: { create: orderItems }
      },
      include: { items: true }
    })

    // 生成登录 token 并设置 cookie
    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    const response = NextResponse.json({
      order,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
      isNewUser,
      message: isNewUser ? '账号已自动创建，下次可用手机号登录' : undefined
    })
    const cookieHeader = setAuthCookie(token)
    Object.entries(cookieHeader).forEach(([key, value]) => response.headers.set(key, value))
    return response
  } catch (error: any) {
    console.error('Guest order error:', error)
    return NextResponse.json({ error: error.message || '下单失败' }, { status: 500 })
  }
}
