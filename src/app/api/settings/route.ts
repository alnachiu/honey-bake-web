import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'

const DEFAULT_LAYOUT = JSON.stringify({
  sections: [
    { type: 'banner', visible: true, order: 0 },
    { type: 'quickNav', visible: true, order: 1 },
    { type: 'coupon', visible: true, order: 2 },
    { type: 'products', visible: true, order: 3 },
  ],
  categories: ['全部', '曲奇', '糖果', '零食', '礼盒'],
  banners: [
    { image: 'https://picsum.photos/seed/banner1/750/320', link: '' },
    { image: 'https://picsum.photos/seed/banner2/750/320', link: '' },
    { image: 'https://picsum.photos/seed/banner3/750/320', link: '' },
  ],
  quickNav: [
    { icon: '🍪', label: '曲奇', category: '曲奇' },
    { icon: '🍬', label: '糖果', category: '糖果' },
    { icon: '🥜', label: '零食', category: '零食' },
    { icon: '🎁', label: '礼盒', category: '礼盒' },
  ]
})

export async function GET() {
  try {
    let settings = await prisma.shopSetting.findUnique({ where: { id: 'default' } })
    if (!settings) {
      settings = await prisma.shopSetting.create({
        data: { id: 'default', name: '甜蜜烘焙', phone: '', desc: '用心烘焙每一份甜蜜', layout: DEFAULT_LAYOUT }
      })
    }
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdmin()
    const data = await request.json()
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.desc !== undefined) updateData.desc = data.desc
    if (data.paymentQR !== undefined) updateData.paymentQR = data.paymentQR
    if (data.layout !== undefined) updateData.layout = typeof data.layout === 'string' ? data.layout : JSON.stringify(data.layout)

    const settings = await prisma.shopSetting.upsert({
      where: { id: 'default' },
      update: updateData,
      create: { id: 'default', name: data.name || '甜蜜烘焙', phone: data.phone || '', desc: data.desc || '', layout: DEFAULT_LAYOUT }
    })
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 })
  }
}
