import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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

/** 套餐绑定的「成为会员自动推送」券 id：去重去空 */
function parseCouponIds(raw: any): string[] {
  const list = Array.isArray(raw?.couponIds) ? raw.couponIds : []
  return Array.from(new Set(list.filter(Boolean).map((v: any) => String(v))))
}

/**
 * 券存在性校验，在事务外先做。
 * 不这么做的话，勾了一张刚被别人删掉的券会写进一个查不到券的关联行，
 * 店主看到「保存成功」却永远推不出东西来。
 */
async function couponIdsError(couponIds: string[]): Promise<string | null> {
  if (!couponIds.length) return null
  const found = await prisma.coupon.count({ where: { id: { in: couponIds } } })
  return found === couponIds.length ? null : '有优惠券已被删除，请刷新后重新勾选'
}

/** 把套餐绑定的券整体同步成给定的这一批：先清后建，比逐条 diff 简单也不易漏 */
async function syncPlanCoupons(
  tx: Prisma.TransactionClient,
  planId: string,
  couponIds: string[]
): Promise<void> {
  await tx.membershipPlanCoupon.deleteMany({ where: { planId } })
  if (couponIds.length) {
    await tx.membershipPlanCoupon.createMany({
      data: couponIds.map(couponId => ({ planId, couponId }))
    })
  }
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

      const plans = await prisma.membershipPlan.findMany({
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        // 供后台套餐表单回显「成为会员自动推送」勾了哪些券
        include: { giftCoupons: { select: { couponId: true } } }
      })

      // 每个套餐卖出了多少张——删除前要据此判断能不能删
      const grouped = await prisma.membershipOrder.groupBy({
        by: ['planId'],
        _count: { _all: true }
      })
      const soldCount: Record<string, number> = Object.fromEntries(
        grouped.map(g => [g.planId, g._count._all])
      )

      return NextResponse.json({
        plans: plans.map(({ giftCoupons, ...p }) => ({
          ...p,
          soldCount: soldCount[p.id] || 0,
          couponIds: giftCoupons.map(g => g.couponId)
        }))
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
    const raw = await request.json()

    const validated = validatePlan(raw)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const couponIds = parseCouponIds(raw)
    const badCoupon = await couponIdsError(couponIds)
    if (badCoupon) return NextResponse.json({ error: badCoupon }, { status: 400 })

    const plan = await prisma.$transaction(async tx => {
      const created = await tx.membershipPlan.create({ data: validated.data })
      await syncPlanCoupons(tx, created.id, couponIds)
      return created
    })

    return NextResponse.json({ plan: { ...plan, couponIds } })
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

    const couponIds = parseCouponIds(raw)
    const badCoupon = await couponIdsError(couponIds)
    if (badCoupon) return NextResponse.json({ error: badCoupon }, { status: 400 })

    const plan = await prisma.$transaction(async tx => {
      // 改价不影响已下单未确认的记录：那些单子存的是下单时的价格快照
      const updated = await tx.membershipPlan.update({ where: { id }, data: validated.data })
      // 套餐字段与绑定的券一起改：只改一半会让「保存成功」变成一句空话
      await syncPlanCoupons(tx, id, couponIds)
      return updated
    })

    return NextResponse.json({ plan: { ...plan, couponIds } })
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
