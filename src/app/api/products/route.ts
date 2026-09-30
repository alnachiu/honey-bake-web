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
    // 传了 ids 就按 id 批量取：购物车/结算页里的商品是加购时的快照，
    // 店主改过运费或价格后需要用这份最新数据校准，否则展示金额与实收不符。
    const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length) where.id = { in: ids }

    const products = await prisma.product.findMany({
      where,
      // sort 是店主在后台「↑↓」调出来的顺序，越小越前。
      // 二级键必须是 createdAt desc（保持上架时间倒序）：存量商品的 sort 全是 0，
      // 这样没排过序的店展示效果与从前完全一致；而新建的商品 sort 也是 0，
      // 于是天然排在所有已排序项（1..n）之前——正是店主选定的「新品在最前」。
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
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
