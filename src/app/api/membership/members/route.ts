import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { isMemberActive, extendMemberExpire } from '@/lib/utils'

/** 已购买会员的数据列表（含已过期的，店主可能要查历史） */
export async function GET() {
  try {
    await requireAdmin()

    const users = await prisma.user.findMany({
      where: { memberExpire: { not: null } },
      orderBy: { memberExpire: 'desc' },
      select: { id: true, name: true, email: true, phone: true, memberExpire: true, createdAt: true }
    })

    // 每人累计买过多少张会员卡（只算已确认收款的）
    const grouped = await prisma.membershipOrder.groupBy({
      by: ['userId'],
      where: { status: 'paid' },
      _count: { _all: true },
      _sum: { price: true }
    })
    const stat: Record<string, { count: number; amount: number }> = Object.fromEntries(
      grouped.map(g => [g.userId, { count: g._count._all, amount: g._sum.price || 0 }])
    )

    const now = new Date()
    const members = users.map(u => ({
      ...u,
      active: isMemberActive(u.memberExpire, now),
      buyCount: stat[u.id]?.count || 0,
      buyAmount: stat[u.id]?.amount || 0
    }))

    return NextResponse.json({
      members,
      activeCount: members.filter(m => m.active).length,
      totalCount: members.length
    })
  } catch (error: any) {
    console.error('Get members error:', error)
    return NextResponse.json({ error: error.message || '获取会员数据失败' }, { status: 500 })
  }
}

/**
 * 店主手动调整会员到期时间：
 * 传 addDays 为在现有基础上延长，传 memberExpire 为直接设定（null = 取消会员）
 */
export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const data = await request.json()

    const userId = String(data?.userId || '')
    if (!userId) return NextResponse.json({ error: '缺少用户 id' }, { status: 400 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, memberExpire: true }
    })
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

    let next: Date | null

    if (data.addDays !== undefined) {
      const days = parseInt(data.addDays, 10)
      if (!Number.isInteger(days) || days === 0) {
        return NextResponse.json({ error: '请填写要调整的天数' }, { status: 400 })
      }
      // 负数时若减到当前时间之前，等同于会员失效
      const base = user.memberExpire && new Date(user.memberExpire) > new Date() ? user.memberExpire : new Date()
      const candidate = extendMemberExpire(base, days)
      next = candidate.getTime() > Date.now() ? candidate : new Date(0)
    } else if (data.memberExpire === null || data.memberExpire === '') {
      next = null
    } else {
      const raw = String(data.memberExpire)
      const parsed = new Date(`${raw}T23:59:59`)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '到期时间格式不正确' }, { status: 400 })
      }
      next = parsed
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { memberExpire: next },
      select: { id: true, name: true, memberExpire: true }
    })

    return NextResponse.json({ user: updated })
  } catch (error: any) {
    console.error('Update member expire error:', error)
    return NextResponse.json({ error: error.message || '调整失败' }, { status: 500 })
  }
}
