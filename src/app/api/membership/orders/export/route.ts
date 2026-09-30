import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import { toCsv, csvResponse } from '@/lib/csv'
import { resolveOrderDateRange } from '@/lib/utils'

/**
 * 会员卡购买记录导出。
 *
 * 列取的是订单上的快照字段（planName / price / days），不是关联出来的套餐当前值——
 * 套餐改价改名后，历史记录必须仍显示当时成交的条款，否则对不上账。
 */
export async function GET(request: Request) {
  try {
    // 显式判角色而不是 requireAdmin()：后者抛普通 Error，会被 catch 变成 500，
    // 权限问题看起来像服务端故障。非店主一律 403（与订单导出保持一致）。
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: any = {}
    if (status) where.status = status

    // 与商品订单导出同一套日期解析（非法输入忽略、起止填反自动交换）。
    // 会员卡记录是按年积攒的，店主对账时几乎总是只要某一段——没有这个条件，
    // 导出只能拿全量再自己在 Excel 里筛。
    const range = resolveOrderDateRange(searchParams.get('startDate'), searchParams.get('endDate'))
    if (range) where.createdAt = range

    const orders = await prisma.membershipOrder.findMany({
      where,
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    })

    const headers = ['会员卡单号', '下单时间', '客户', '手机号', '会员套餐', '天数', '金额', '状态', '收款时间']
    const statusMap: Record<string, string> = { pending: '待确认收款', paid: '已开通', cancelled: '已取消' }

    const rows = orders.map(o => [
      o.orderNo,
      new Date(o.createdAt).toLocaleString('zh-CN'),
      o.user?.name || '',
      // 手机号是会员卡凭证，优先取账号绑定的号码，没有就退回邮箱
      o.user?.phone || o.user?.email || '',
      o.planName,
      o.days,
      o.price.toFixed(2),
      statusMap[o.status] || o.status,
      o.payTime ? new Date(o.payTime).toLocaleString('zh-CN') : ''
    ])

    return csvResponse(toCsv(headers, rows), 'membership_orders')
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
