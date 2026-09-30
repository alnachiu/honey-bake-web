import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200)

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.notification.count({ where: { userId: user.id, read: false } })
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error: any) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ error: error.message || '获取消息失败' }, { status: 500 })
  }
}

/** 标记已读：传 { all: true } 全部已读，传 { ids: [...] } 指定几条 */
export async function PUT(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json().catch(() => ({} as any))

    const where: any = { userId: user.id, read: false }
    if (data?.all !== true) {
      const ids = Array.isArray(data?.ids) ? data.ids.filter(Boolean) : []
      if (!ids.length) return NextResponse.json({ error: '缺少要标记的消息 id' }, { status: 400 })
      where.id = { in: ids }
    }

    const result = await prisma.notification.updateMany({ where, data: { read: true } })
    const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } })

    return NextResponse.json({ success: true, updated: result.count, unreadCount })
  } catch (error: any) {
    console.error('Mark notifications read error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}

/**
 * 删除消息：传 { ids: [...] } 删指定几条，传 { all: true } 清空。
 *
 * 通知是按用户隔离的（Notification.userId），删掉就是真删，不需要像聊天那样
 * 「按边打标记」——那条通知本来就只属于一个人，不存在对方还要看的问题。
 *
 * where 里必须带 userId：ids 来自请求体，是用户可控的。不校验归属的话，
 * 拿到别人的通知 id 就能把别人的消息删掉。越权时 count = 0，不报 500，
 * 也不透露「这个 id 存不存在」。
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json().catch(() => ({} as any))

    const where: any = { userId: user.id }
    if (data?.all !== true) {
      const ids = Array.isArray(data?.ids) ? data.ids.filter(Boolean) : []
      if (!ids.length) return NextResponse.json({ error: '缺少要删除的消息 id' }, { status: 400 })
      where.id = { in: ids }
    }

    const result = await prisma.notification.deleteMany({ where })
    const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } })

    return NextResponse.json({ success: true, deleted: result.count, unreadCount })
  } catch (error: any) {
    console.error('Delete notifications error:', error)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
