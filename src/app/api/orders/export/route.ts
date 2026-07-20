import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: any = {}
    if (status) where.status = status

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, address: true, user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    })

    // Generate CSV
    const headers = ['订单编号', '下单时间', '客户姓名', '手机号', '收货地址', '商品', '金额', '配送费', '优惠券', '实付', '状态', '备注']
    const rows = orders.map(o => {
      const items = o.items.map(i => `${i.name}x${i.quantity}`).join('; ')
      const address = o.address ? `${o.address.region} ${o.address.detail}` : ''
      const statusMap: Record<string, string> = { pending: '待付款', paid: '已付款', making: '制作中', delivering: '配送中', completed: '已完成', cancelled: '已取消' }
      return [
        o.orderNo,
        new Date(o.createdAt).toLocaleString('zh-CN'),
        o.address?.name || o.user?.name || '',
        o.address?.phone || o.user?.phone || '',
        address,
        items,
        o.itemsAmount.toFixed(2),
        o.deliveryFee.toFixed(2),
        o.couponDiscount > 0 ? `-${o.couponDiscount.toFixed(2)}` : '0',
        o.totalAmount.toFixed(2),
        statusMap[o.status] || o.status,
        o.remark || ''
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Add BOM for Excel UTF-8 compatibility
    const bom = '﻿'

    return new NextResponse(bom + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="orders_${new Date().toISOString().slice(0,10)}.csv"`
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
