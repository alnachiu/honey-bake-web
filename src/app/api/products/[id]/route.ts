import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({ where: { id: params.id } })
    if (!product) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 })
    }
    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json({ error: '获取商品失败' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const data = await request.json()
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.price !== undefined) updateData.price = parseFloat(data.price)
    if (data.originalPrice !== undefined) updateData.originalPrice = parseFloat(data.originalPrice)
    if (data.deliveryFee !== undefined) updateData.deliveryFee = parseFloat(data.deliveryFee)
    if (data.category !== undefined) updateData.category = data.category
    if (data.unit !== undefined) updateData.unit = data.unit
    if (data.stock !== undefined) updateData.stock = parseInt(data.stock)
    if (data.images !== undefined) updateData.images = JSON.stringify(data.images)
    if (data.detailImages !== undefined) updateData.detailImages = JSON.stringify(data.detailImages)
    if (data.description !== undefined) updateData.description = data.description
    if (data.detail !== undefined) updateData.detail = data.detail
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags)
    if (data.status !== undefined) updateData.status = data.status

    const product = await prisma.product.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Update product error:', error)
    return NextResponse.json({ error: '更新商品失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    await prisma.product.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: '删除商品失败' }, { status: 500 })
  }
}
