import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { generateOrderNo, calcOrderAmount, calcOrderDeliveryFee, giftFromCoupon, isMemberActive, resolveOrderDateRange } from '@/lib/utils'
import { resolveUserCoupons } from '@/lib/coupons'
import { getMemberDiscountRate } from '@/lib/membership'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    // parseInt('abc') 是 NaN，直接喂给 skip/take 会让 Prisma 抛错变成 500。
    // 分页参数是外部可控的，越界值一律夹回合法范围而不是报错。
    const pageRaw = parseInt(searchParams.get('page') || '1')
    const sizeRaw = parseInt(searchParams.get('pageSize') || '20')
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(sizeRaw, 200) : 20

    // Auto-complete orders in 'delivering' status older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await prisma.order.updateMany({
      where: {
        status: 'delivering',
        updatedAt: { lte: sevenDaysAgo }
      },
      data: { status: 'completed', completeTime: new Date() }
    })

    const isAdmin = user.role === 'admin'
    const where: any = isAdmin ? {} : { userId: user.id }
    if (status) where.status = status

    // 日期筛选只对店主开放：消费者端没有时间筛选控件，多认一个参数就等于多开一个
    // 查询维度，没有必要。店主传空值/脏值时 resolveOrderDateRange 返回 null，不加条件。
    if (isAdmin) {
      const range = resolveOrderDateRange(searchParams.get('startDate'), searchParams.get('endDate'))
      if (range) where.createdAt = range
    }

    // 订单管理列表要一眼看出是谁下的单：地址上的收件人取自 address，
    // 账号本身（可能和收件人不是同一个人）只有管理员才需要看到。
    // 消费者侧刻意不给 user：响应体保持改造前的形状，避免动到正在用的渲染。
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: isAdmin
          ? { items: true, address: true, user: { select: { id: true, name: true, phone: true } } }
          : { items: true, address: true }
      }),
      // 计数放在上面那段自动完成之后，否则「7 天前的配送中」这批刚被改掉的行
      // 会按旧状态算进总数，列表和「共 N 单」对不上
      prisma.order.count({ where })
    ])

    return NextResponse.json({ orders, total, page, pageSize })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取订单失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json()

    // 管理员账号只用于管店和导单，不参与买卖——店主给自己下单会让
    // 营业额、会员数据、订单列表全部失真。前端已隐藏入口，这里兜底挡住直连接口。
    if (user.role === 'admin') {
      return NextResponse.json({ error: '管理员账号不支持下单，请使用顾客账号购买' }, { status: 403 })
    }

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

    // 运费只认库里的 Product.deliveryFee，不采信前端传来的值：
    // 前端那份是加购时的快照，店主改过运费后就过时了，照它收费会让
    // 用户看到的价格和实收不一致。顺带在这里把无效 productId 拦下——
    // 否则会一路走到 order.create 才由外键抛错，报错信息对前端毫无意义。
    const productIds = Array.from(
      new Set<string>(
        data.items.map((item: any) => String(item?.productId || '')).filter((sid: string) => sid !== '')
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
    // 身份单独存一份快照：折扣率被店主设成 1 时 memberDiscount 恒为 0，
    // 光看金额分不出「非会员」和「会员但没打折」，导出对账时就会错。
    const wasMember = isMemberActive(user.memberExpire)

    // 金额统一由 calcOrderAmount 计算，与结算页共用同一套规则（先券后会员，再加整单运费）
    const { couponDiscount, memberDiscount, totalAmount } = calcOrderAmount({
      itemsAmount,
      coupons: resolved.coupons,
      memberDiscountRate,
      deliveryFee
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
          wasMember,
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
