import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { PERIOD_TYPES, evaluateClaimLimits, normalizeDateTime } from '@/lib/utils'
import { isCouponInWindow } from '@/lib/coupons'

/** 券类型的白名单。买赠券必须在这里，否则下面的归一化会把它静默改写成满减券。 */
const COUPON_TYPES = ['reduce', 'discount', 'gift']

interface CouponInput {
  name: string
  type: string
  value: number
  minAmount: number
  stock: number
  perUserLimit: number
  stackable: boolean
  validMode: string
  startTime: string
  endTime: string
  validDays: number
  description: string
  giftName: string
  giftQuantity: number
  visible: boolean
  rollingDays: number
  rollingLimit: number
  periodType: string
  periodCount: number
}

type ValidateResult = { ok: true; data: CouponInput } | { ok: false; error: string }

/** 创建与编辑共用的入参校验，避免两处规则发散 */
function validateCouponInput(raw: any): ValidateResult {
  const fail = (error: string): ValidateResult => ({ ok: false, error })

  const name = String(raw?.name || '').trim()
  const type = COUPON_TYPES.includes(raw?.type) ? (raw.type as string) : 'reduce'
  const minAmount = parseFloat(raw?.minAmount ?? '0')
  const stock = parseInt(raw?.stock ?? '0', 10)
  const perUserLimit = parseInt(raw?.perUserLimit ?? '1', 10)
  const stackable = raw?.stackable === true
  const validMode = raw?.validMode === 'relative' ? 'relative' : 'fixed'
  const validDays = parseInt(raw?.validDays ?? '0', 10)
  const description = String(raw?.description || '')
  const visible = raw?.visible !== false

  if (!name) return fail('请填写优惠券名称')
  if (!Number.isFinite(minAmount) || minAmount < 0) return fail('最低消费不能为负数')
  if (!Number.isInteger(stock) || stock < 0) return fail('库存不能为负数')
  if (!Number.isInteger(perUserLimit) || perUserLimit < 0) return fail('每人限领数量不能为负数')

  // 额度与赠品：买赠券不产生金额优惠，value 固定为 0，改校验赠品信息
  let value = parseFloat(raw?.value)
  let giftName = ''
  let giftQuantity = 0
  if (type === 'gift') {
    value = 0
    giftName = String(raw?.giftName || '').trim()
    giftQuantity = parseInt(raw?.giftQuantity ?? '0', 10)
    if (!giftName) return fail('请填写赠品名称')
    if (!Number.isInteger(giftQuantity) || giftQuantity < 1) return fail('赠品数量需为大于 0 的整数')
  } else {
    if (!Number.isFinite(value) || value <= 0) return fail('优惠额度必须大于 0')
    if (type === 'discount' && value >= 10) return fail('折扣力度需小于 10 折（如 9 表示九折）')
  }

  // 领取限制的时间维度。两种都可关闭（填 0），启用时必须成对出现，
  // 否则会落进「设了窗口却永远拦不住」或「设了张数却没有窗口可算」的歧义里。
  const rollingDays = parseInt(raw?.rollingDays ?? '0', 10)
  const rollingLimit = parseInt(raw?.rollingLimit ?? '0', 10)
  if (!Number.isInteger(rollingDays) || rollingDays < 0) return fail('滚动限领天数不能为负数')
  if (!Number.isInteger(rollingLimit) || rollingLimit < 0) return fail('滚动限领张数不能为负数')
  if ((rollingDays > 0) !== (rollingLimit > 0)) {
    return fail('滚动限领要填全：多少天内最多领几张，两个都填 0 表示不启用')
  }

  const periodType = (PERIOD_TYPES as readonly string[]).includes(raw?.periodType)
    ? (raw.periodType as string)
    : 'none'
  const periodCount = parseInt(raw?.periodCount ?? '0', 10)
  if (!Number.isInteger(periodCount) || periodCount < 0) return fail('每周期限领张数不能为负数')
  if ((periodType !== 'none') !== (periodCount > 0)) {
    return fail('自然周期限领要填全：先选每天/每周/每月，再填张数')
  }

  let startTime = ''
  let endTime = ''

  if (validMode === 'relative') {
    if (!Number.isInteger(validDays) || validDays < 1) {
      return fail('领取后有效天数需为大于 0 的整数')
    }
  } else {
    startTime = normalizeDateTime(String(raw?.startTime || ''))
    endTime = normalizeDateTime(String(raw?.endTime || ''), true)
    if (!startTime || !endTime) return fail('请选择开始和结束时间')
    if (startTime > endTime) return fail('开始时间不能晚于结束时间')
  }

  return {
    ok: true,
    data: {
      name,
      type,
      value,
      minAmount,
      stock,
      perUserLimit,
      stackable,
      validMode,
      startTime,
      endTime,
      validDays: validMode === 'relative' ? validDays : 0,
      description,
      giftName,
      giftQuantity,
      visible,
      rollingDays,
      rollingLimit,
      periodType,
      periodCount
    }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all')
    const id = searchParams.get('id')

    // 管理员按 id 取单张（编辑页用）
    if (id) {
      const user = await getAuthUser()
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 403 })
      }
      const coupon = await prisma.coupon.findUnique({ where: { id } })
      if (!coupon) return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })
      const claimCount = await prisma.userCoupon.count({ where: { couponId: id } })
      const usedCount = await prisma.userCoupon.count({ where: { couponId: id, status: 'used' } })
      return NextResponse.json({ coupon: { ...coupon, claimCount, usedCount } })
    }

    // 管理员查看全部：附带领取/使用统计，供删除前展示影响面。
    // 注意这里**不能**按 visible 过滤——隐藏券正是要在后台管理的东西。
    if (all === 'true') {
      const user = await getAuthUser()
      if (user?.role === 'admin') {
        const coupons = await prisma.coupon.findMany({
          orderBy: { createdAt: 'desc' },
          // 哪些会员卡会自动推这张券，列表上给个徽章
          include: { planGifts: { select: { plan: { select: { id: true, name: true } } } } }
        })

        const grouped = await prisma.userCoupon.groupBy({
          by: ['couponId', 'status'],
          _count: { _all: true }
        })
        const claimCount: Record<string, number> = {}
        const usedCount: Record<string, number> = {}
        for (const g of grouped) {
          claimCount[g.couponId] = (claimCount[g.couponId] || 0) + g._count._all
          if (g.status === 'used') usedCount[g.couponId] = g._count._all
        }

        return NextResponse.json({
          coupons: coupons.map(({ planGifts, ...c }) => ({
            ...c,
            claimCount: claimCount[c.id] || 0,
            usedCount: usedCount[c.id] || 0,
            autoPushPlans: planGifts.map(p => p.plan)
          }))
        })
      }
    }

    // 用户查看可领取的
    const user = await getAuthUser()

    // 有效期两种模式的判定逻辑不同（fixed 看日期窗口，relative 恒可领），
    // 统一交给 isCouponInWindow，避免在 SQL 里写一套、JS 里再写一套。
    // visible=false 的隐藏券不在这里出现：消费者看不到也不能自领，只能由后台推送
    // （领了之后它仍然会出现在券包里，因为「隐藏」不等于「失效」）。
    const active = await prisma.coupon.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' }
    })
    const coupons = active.filter(c => isCouponInWindow(c) && c.visible)

    // 一次把券包的时间戳全取回来，三条限领规则（总量 / 滚动窗口 / 自然周期）
    // 都在 JS 里算——比按券逐个 count 稳，也避免规则散在两个查询里。
    const mineTimes: Record<string, Date[]> = {}
    if (user) {
      const rows = await prisma.userCoupon.findMany({
        where: { userId: user.id },
        select: { couponId: true, claimTime: true }
      })
      for (const r of rows) {
        ;(mineTimes[r.couponId] ||= []).push(r.claimTime)
      }
    }

    return NextResponse.json({
      coupons: coupons.map(c => {
        const limit = evaluateClaimLimits(c, mineTimes[c.id] || [])
        const soldOut = c.stock > 0 && c.claimed >= c.stock
        return {
          ...c,
          myClaimCount: limit.totalCount,
          soldOut,
          reachedLimit: limit.blocked,
          // 还能再领几张（-1 表示所有规则都没启用）
          remainForMe: limit.remain,
          limitReason: limit.reason
        }
      })
    })
  } catch (error: any) {
    console.error('Get coupons error:', error)
    return NextResponse.json({ error: error.message || '获取优惠券失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const raw = await request.json()

    const validated = validateCouponInput(raw)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const coupon = await prisma.coupon.create({ data: validated.data })
    return NextResponse.json({ coupon })
  } catch (error: any) {
    console.error('Create coupon error:', error)
    return NextResponse.json({ error: error.message || '创建优惠券失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin()
    const raw = await request.json()

    const id = String(raw?.id || '')
    if (!id) return NextResponse.json({ error: '缺少优惠券 id' }, { status: 400 })

    const existing = await prisma.coupon.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: '优惠券不存在' }, { status: 404 })

    const validated = validateCouponInput(raw)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const coupon = await prisma.coupon.update({ where: { id }, data: validated.data })
    return NextResponse.json({ coupon })
  } catch (error: any) {
    console.error('Update coupon error:', error)
    return NextResponse.json({ error: error.message || '保存失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin()

    // 兼容 body 与 query 两种传参
    let id = new URL(request.url).searchParams.get('id') || ''
    if (!id) {
      try {
        id = (await request.json())?.id || ''
      } catch {
        /* body 为空时忽略 */
      }
    }
    if (!id) {
      return NextResponse.json({ error: '缺少优惠券 id' }, { status: 400 })
    }

    const coupon = await prisma.coupon.findUnique({ where: { id } })
    if (!coupon) {
      return NextResponse.json({ error: '优惠券不存在或已被删除' }, { status: 404 })
    }

    // 用户已领取的记录需一并回收。UserCoupon -> Coupon 有外键约束，
    // 不先清理会直接抛 P2003 导致删除失败（这正是此前「删不掉」的原因）。
    const removedClaims = await prisma.userCoupon.count({ where: { couponId: id } })

    await prisma.$transaction([
      prisma.userCoupon.deleteMany({ where: { couponId: id } }),
      prisma.coupon.delete({ where: { id } })
    ])

    return NextResponse.json({ success: true, removedClaims })
  } catch (error: any) {
    console.error('Delete coupon error:', error)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}
