import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  try {
    await requireAdmin()

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    // 今日订单
    const todayOrders = await prisma.order.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { in: ['paid', 'making', 'delivering', 'completed'] }
      }
    })

    // 今日收入
    const todayOrdersData = await prisma.order.findMany({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        status: { in: ['paid', 'making', 'delivering', 'completed'] }
      }
    })
    const todayRevenue = todayOrdersData.reduce((sum, o) => sum + o.totalAmount, 0)

    // 商品总数
    const totalProducts = await prisma.product.count()

    // 用户总数
    const totalUsers = await prisma.user.count()

    // 本周趋势
    const weekOrders: number[] = []
    const weekRevenue: number[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const dayOrders = await prisma.order.findMany({
        where: { createdAt: { gte: dayStart, lt: dayEnd } }
      })
      weekOrders.push(dayOrders.length)
      weekRevenue.push(dayOrders.reduce((s, o) => s + o.totalAmount, 0))
    }

    // 待处理订单
    const pendingOrdersCount = await prisma.order.count({
      where: { status: 'paid' }
    })

    return NextResponse.json({
      todayOrders,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      totalProducts,
      totalUsers,
      weekOrders,
      weekRevenue,
      pendingOrdersCount
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
