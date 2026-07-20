import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAuth, requireAdmin } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all')

    // 管理员查看全部
    if (all === 'true') {
      const user = await getAuthUser()
      if (user?.role === 'admin') {
        const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } })
        return NextResponse.json({ coupons })
      }
    }

    // 用户查看可领取的
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const coupons = await prisma.coupon.findMany({
      where: {
        status: 'active',
        startTime: { lte: dateStr },
        endTime: { gte: dateStr }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ coupons })
  } catch (error) {
    return NextResponse.json({ error: '获取优惠券失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const data = await request.json()

    const coupon = await prisma.coupon.create({
      data: {
        name: data.name,
        type: data.type,
        value: parseFloat(data.value),
        minAmount: parseFloat(data.minAmount || '0'),
        stock: parseInt(data.stock || '0'),
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description || ''
      }
    })

    return NextResponse.json({ coupon })
  } catch (error) {
    return NextResponse.json({ error: '创建优惠券失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAdmin()
    const { id } = await request.json()
    await prisma.coupon.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
