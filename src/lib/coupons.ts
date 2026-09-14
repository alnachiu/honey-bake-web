import { prisma } from './prisma'
import { calcCouponsDiscount, canStack, todayStr } from './utils'

export interface ResolvedCoupon {
  userCouponId: string
  couponId: string
  name: string
  type: string
  value: number
  minAmount: number
  stackable: boolean
}

export interface ResolveResult {
  ok: boolean
  error?: string
  /** 实际生效的券：已剔除核销了也拿不到优惠的券 */
  coupons: ResolvedCoupon[]
  discount: number
  total: number
}

/**
 * 下单前校验用户提交的优惠券，返回实际生效的券与优惠金额。
 *
 * `userCouponIds` 是 UserCoupon.id（用户券包里具体的那一张），不是券模板 id——
 * 按具体那一张核销，用户领了多张时才不会一次被全部烧掉。
 *
 * 校验项：归属（必须属于当前用户且状态为 active）、有效期、叠加规则。
 * 此前订单接口只查券模板的 status，任何登录用户传任意券 id 都能享受折扣，
 * 叠加规则与每人限领也就形同虚设。
 */
export async function resolveUserCoupons(
  userId: string,
  userCouponIds: string[] | undefined | null,
  itemsAmount: number
): Promise<ResolveResult> {
  const ids = Array.from(new Set((userCouponIds || []).filter(Boolean)))
  if (!ids.length) {
    return { ok: true, coupons: [], discount: 0, total: itemsAmount }
  }

  // 归属校验
  const mine = await prisma.userCoupon.findMany({
    where: { id: { in: ids }, userId },
    include: { coupon: true }
  })
  if (mine.length !== ids.length) {
    return {
      ok: false,
      error: '优惠券不存在或不属于当前账号',
      coupons: [],
      discount: 0,
      total: itemsAmount
    }
  }

  const notUsable = mine.find(uc => uc.status !== 'active')
  if (notUsable) {
    return {
      ok: false,
      error: `「${notUsable.coupon.name}」已使用或已失效`,
      coupons: [],
      discount: 0,
      total: itemsAmount
    }
  }

  // 券模板有效期校验
  const dateStr = todayStr()
  for (const uc of mine) {
    const c = uc.coupon
    if (c.status !== 'active') {
      return { ok: false, error: `「${c.name}」已停止发放`, coupons: [], discount: 0, total: itemsAmount }
    }
    if (dateStr < c.startTime) {
      return { ok: false, error: `「${c.name}」还未到生效时间`, coupons: [], discount: 0, total: itemsAmount }
    }
    if (dateStr > c.endTime) {
      return { ok: false, error: `「${c.name}」已过期`, coupons: [], discount: 0, total: itemsAmount }
    }
  }

  let candidates: ResolvedCoupon[] = mine.map(uc => ({
    userCouponId: uc.id,
    couponId: uc.couponId,
    name: uc.coupon.name,
    type: uc.coupon.type,
    value: uc.coupon.value,
    minAmount: uc.coupon.minAmount,
    stackable: uc.coupon.stackable
  }))

  // 叠加规则：多张同时使用时，每一张都必须允许叠加
  if (!canStack(candidates)) {
    return {
      ok: false,
      error: '所选优惠券不可叠加使用，请只选择一张',
      coupons: [],
      discount: 0,
      total: itemsAmount
    }
  }

  // 剔除实际不产生优惠的券（如未达门槛的满减券），避免白白核销
  for (const c of candidates.slice()) {
    if (!candidates.some(k => k.userCouponId === c.userCouponId)) continue
    const withAll = calcCouponsDiscount(itemsAmount, candidates).discount
    const without = candidates.filter(k => k.userCouponId !== c.userCouponId)
    const withoutDiscount = calcCouponsDiscount(itemsAmount, without).discount
    if (Math.round((withAll - withoutDiscount) * 100) === 0) candidates = without
  }

  const { discount, total } = calcCouponsDiscount(itemsAmount, candidates)
  return { ok: true, coupons: candidates, discount, total }
}
