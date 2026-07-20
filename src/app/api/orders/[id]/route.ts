import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true, address: true }
    })

    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    if (order.userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    return NextResponse.json({ order })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { status, trackingNo } = body

    const validStatuses = ['pending', 'paid', 'making', 'delivering', 'completed', 'cancelled']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: '无效的状态' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { id: params.id } })
    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    // 取消订单 - 本人或管理员
    if (status === 'cancelled') {
      if (order.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 })
      }
    }

    // 确认收货 - 本人或管理员
    if (status === 'completed' && order.userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    // 确认付款 - 仅管理员
    if (status === 'paid' && user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    // 其他状态变更需管理员
    if (!['cancelled', 'completed', 'paid'].includes(status) && user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const updateData: any = { status }
    if (status === 'paid') updateData.payTime = new Date()
    if (status === 'delivering') {
      updateData.deliveryTime = new Date()
      if (trackingNo) updateData.trackingNo = trackingNo
    }
    if (status === 'completed') updateData.completeTime = new Date()
    if (status === 'cancelled') updateData.cancelTime = new Date()

    await prisma.order.update({ where: { id: params.id }, data: updateData })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
