import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import { toCsv, csvResponse } from '@/lib/csv'

export async function GET(request: Request) {
  try {
    // 显式判角色而不是 requireAdmin()：后者抛的是普通 Error，会被下面的 catch
    // 变成 500，权限问题看起来像服务端故障。导出是店主专用，非店主一律 403。
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: any = {}
    if (status) where.status = status

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, address: true, user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    })

    // 「是否会员」取的是下单当时的快照（Order.wasMember），不是当前会员状态——
    // 顾客可能下单后才开卡，用当前状态回填会让历史订单的对账全部错位。
    // 兜底判 memberDiscount > 0 是为了本次改造之前的历史单：那时没有快照字段，
    // 但会员折扣率非 1 时必然留下折扣金额，能反推出当时的会员身份。
    const headers = ['订单编号', '下单时间', '客户姓名', '手机号', '收货地址', '商品', '赠品', '金额', '运费', '优惠券', '实付', '是否会员', '状态', '备注']
    const rows = orders.map(o => {
      const items = o.items.map(i => `${i.name}x${i.quantity}`).join('; ')
      // 买赠券带来的赠品，单独一列——它不在 items 里（不关联商品、不计金额）
      const gift = o.giftName && o.giftQuantity > 0 ? `${o.giftName}x${o.giftQuantity}` : ''
      const address = o.address ? `${o.address.region} ${o.address.detail}` : ''
      // 这份映射刻意与 lib/utils 的 getOrderStatusText 不同：导出面向对账，
      // 「已付款」比界面上的「待制作」更直观。改这里前先想清楚店主是否依赖它。
      const statusMap: Record<string, string> = { pending: '待付款', paid: '已付款', making: '制作中', delivering: '配送中', completed: '已完成', cancelled: '已取消' }
      return [
        o.orderNo,
        new Date(o.createdAt).toLocaleString('zh-CN'),
        o.address?.name || o.user?.name || '',
        o.address?.phone || o.user?.phone || '',
        address,
        items,
        gift,
        o.itemsAmount.toFixed(2),
        o.deliveryFee.toFixed(2),
        o.couponDiscount > 0 ? `-${o.couponDiscount.toFixed(2)}` : '0',
        o.totalAmount.toFixed(2),
        o.wasMember || o.memberDiscount > 0 ? '是' : '否',
        statusMap[o.status] || o.status,
        o.remark || ''
      ]
    })

    return csvResponse(toCsv(headers, rows), 'orders')
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
