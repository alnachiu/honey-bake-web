import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: any = { status: 'on' }
    if (category) where.category = category
    if (keyword) where.name = { contains: keyword }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: '获取商品失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const data = await request.json()
    const product = await prisma.product.create({
      data: {
        name: data.name,
        price: parseFloat(data.price),
        originalPrice: parseFloat(data.originalPrice || '0'),
        deliveryFee: parseFloat(data.deliveryFee || '0'),
        category: data.category || '',
        unit: data.unit || '份',
        stock: parseInt(data.stock || '0'),
        images: JSON.stringify(data.images || []),
        detailImages: JSON.stringify(data.detailImages || []),
        description: data.description || '',
        detail: data.detail || '',
        tags: JSON.stringify(data.tags || []),
        status: data.status || 'on',
      }
    })

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Create product error:', error)
    return NextResponse.json({ error: '创建商品失败' }, { status: 500 })
  }
}
