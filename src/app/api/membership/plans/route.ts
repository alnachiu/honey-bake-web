import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'

/** 套餐入参校验，POST/PUT 共用 */
function validatePlan(raw: any):
  | { ok: true; data: { name: string; price: number; days: number; sort: number; active: boolean } }
  | { ok: false; error: string } {
  const name = String(raw?.name || '').trim()
  const price = parseFloat(raw?.price)
  const days = parseInt(raw?.days, 10)
  const sort = Number.isFinite(parseInt(raw?.sort, 10)) ? parseInt(raw?.sort, 10) : 0
  const active = raw?.active !== false

  if (!name) return { ok: false, error: '请填写套餐名称' }
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: '价格不能为负数' }
  if (!Number.isInteger(days) || days < 1) return { ok: false, error: '有效天数需为大于 0 的整数' }

  return { ok: true, data: { name, price, days, sort, active } }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'

    if (all) {
      const user = await getAuthUser()
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 })
      }

      const plans = await prisma.membershipPlan.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] })

      // 每个套餐卖出了多少张——删除前要据此判断能不能删
      const grouped = await prisma.membershipOrder.groupBy({
        by: ['planId'],
        _count: { _all: true }
      })
      const soldCount: Record<string, number> = Object.fromEntries(
        grouped.map(g => [g.planId, g._count._all])
      )

      return NextResponse.json({
        plans: plans.map(p => ({ ...p, soldCount: soldCount[p.id] || 0 }))
      })
    }

    // 用户端只看在售套餐
    const plans = await prisma.membershipPlan.findMany({
      where: { active: true },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }]
    })
    return NextResponse.json({ plans })
  } catch (error: any) {
    console.error('Get membership plans error:', error)
    return NextResponse.json({ error: error.message || '获取会员卡套餐失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const validated = validatePlan(await request.json())
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    const plan = await prisma.membershipPlan.create({ data: validated.data })
    return NextResponse.json({ plan })
  } catch (error: any) {
    console.error('Create membership plan error:', error)
    return NextResponse.json({ error: error.message || '创建套餐失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const raw = await request.json()
    const id = String(raw?.id || '')
    if (!id) return NextResponse.json({ error: '缺少套餐 id' }, { status: 400 })

    const existing = await prisma.membershipPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })

    const validated = validatePlan(raw)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    // 改价不影响已下单未确认的记录：那些单子存的是下单时的价格快照
    const plan = await prisma.membershipPlan.update({ where: { id }, data: validated.data })
    return NextResponse.json({ plan })
  } catch (error: any) {
    console.error('Update membership plan error:', error)
    return NextResponse.json({ error: error.message || '保存失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()

    let id = new URL(request.url).searchParams.get('id') || ''
    if (!id) {
      try {
        id = (await request.json())?.id || ''
      } catch {
        /* 无 body */
      }
    }
    if (!id) return NextResponse.json({ error: '缺少套餐 id' }, { status: 400 })

    const existing = await prisma.membershipPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: '套餐不存在或已被删除' }, { status: 404 })

    // 有购买记录就不能删——会员的开通记录要能追溯到是哪个套餐，
    // 且外键会直接拦下来。引导店主改为「下架」。
    const soldCount = await prisma.membershipOrder.count({ where: { planId: id } })
    if (soldCount > 0) {
      return NextResponse.json(
        { error: `该套餐已有 ${soldCount} 笔购买记录，无法删除。如需停止售卖，请改为「下架」。` },
        { status: 400 }
      )
    }

    await prisma.membershipPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete membership plan error:', error)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
