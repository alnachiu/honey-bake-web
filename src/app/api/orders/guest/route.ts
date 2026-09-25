import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie, hashPassword } from '@/lib/auth'
import { generateOrderNo, calcOrderAmount, calcOrderDeliveryFee, isValidPhone, isMemberActive } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const { name, phone, address, items, remark } = data

    if (!name || !phone) {
      return NextResponse.json({ error: '请填写姓名和手机号' }, { status: 400 })
    }
    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 })
    }
    if (!items || !items.length) {
      return NextResponse.json({ error: '订单不能为空' }, { status: 400 })
    }

    // 查找或创建用户。手机号不是 unique 字段，同号多账号时按创建时间取最早的，
    // 保证同一部手机每次下单都落到同一个账号上。
    let user = await prisma.user.findFirst({ where: { phone }, orderBy: { createdAt: 'asc' } })
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

    // 管理员手机号不该在这里落单：/api/orders 已按 role 拦了管理员，
    // 但游客单是按手机号匹配账号的，店主用自己的号走游客结算会绕过那道拦截。
    if (user.role === 'admin') {
      return NextResponse.json({ error: '管理员账号不支持下单，请使用顾客账号购买' }, { status: 403 })
    }

    // 计算金额
    let itemsAmount = 0
    // 嵌套 create 里只给 productId，不能再写 product: { connect } —— 那个输入类型
    // 不含 productId 标量，两个一起传会让 Prisma 抛 "Unknown argument `productId`"，
    // 游客下单整个 500。登录用户走的 /api/orders 也是只传 productId。
    const orderItems = items.map((item: any) => {
      const amount = item.price * item.quantity
      itemsAmount += amount
      return {
        productId: item.id,
        name: item.name,
        image: item.image || '',
        price: item.price,
        quantity: item.quantity,
        unit: item.unit || '份'
      }
    })

    // 运费按库里的 Product.deliveryFee 取最高，不采信前端传的值（理由同 /api/orders）。
    // 取的是入参里的 item.id（游客单的商品 id 字段叫 id，不是 productId，见上面的映射）
    const productIds = Array.from(
      new Set<string>(
        items.map((item: any) => String(item?.id || '')).filter((sid: string) => sid !== '')
      )
    )
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, deliveryFee: true }
    })
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: '订单中有商品已下架或不存在，请返回购物车重新结算' }, { status: 400 })
    }
    const deliveryFee = calcOrderDeliveryFee(products)

    // 游客不使用优惠券：游客没有券包，此前这里会凭 couponId 直接给出折扣却不核销任何券
    // （且按手机号查到的可能是他人账号，updateMany 会烧掉对方已领的券）。领券需先登录。
    //
    // 会员折扣是「登录后才给」的：会员卡以手机号为凭证，但仅凭一个未经校验的号码就
    // 在游客单上静默打折，用户会对不上账。结算页在检测到会员手机号时会提示
    // 「请先用手机号登录」，并提供一键登录入口——登录后走 /api/orders，折扣自然生效。
    const { couponDiscount, memberDiscount, totalAmount } = calcOrderAmount({
      itemsAmount,
      coupons: [],
      memberDiscountRate: 1,
      deliveryFee
    })

    // 记的是账号的真实会员身份，不是「这单有没有打折」。
    // 会员用游客身份下单时两者会不一致（有折扣身份但实付没打折），
    // 这正是店主该看到的异常，导出里标成会员才查得出来。
    const wasMember = isMemberActive(user.memberExpire)

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
        memberDiscount,
        totalAmount,
        remark: remark || '',
        addressId: addr.id,
        wasMember,
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
