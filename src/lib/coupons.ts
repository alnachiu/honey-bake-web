import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  calcCouponsDiscount,
  canStack,
  couponValueText,
  nowStr,
  normalizeDateTime,
  parseLocalDateTime
} from './utils'

/** 判定有效期所必需的券字段 */
export interface CouponWindow {
  validMode: string
  startTime: string
  endTime: string
  validDays: number
}

/** 判定有效期所必需的用户券字段 */
export interface UserCouponWindow {
  status: string
  expireTime: Date | string | null
}

/**
 * 券模板本身是否处于「可领取」窗口。
 *
 * - fixed：按 startTime ~ endTime 判断（旧数据只有日期，会补齐为当天 00:00 / 23:59）
 * - relative：没有领取窗口概念，只要 status 是 active 就一直可领，
 *   真正的有效期在领取那一刻按「领取后 N 天」落到 UserCoupon.expireTime
 */
export function isCouponInWindow(coupon: CouponWindow, now: Date = new Date()): boolean {
  if (coupon.validMode === 'relative') return true
  const t = nowStr(now)
  const start = normalizeDateTime(coupon.startTime)
  const end = normalizeDateTime(coupon.endTime, true)
  if (start && t < start) return false
  if (end && t > end) return false
  return true
}

/**
 * 用户券的实际到期时刻。返回 null 表示不受时间限制。
 * relative 模式落在「领取时刻 + validDays」，fixed 模式取券模板的 endTime。
 */
export function userCouponExpireAt(coupon: CouponWindow, claimTime: Date = new Date()): Date | null {
  if (coupon.validMode === 'relative' && coupon.validDays > 0) {
    return new Date(claimTime.getTime() + coupon.validDays * 24 * 60 * 60 * 1000)
  }
  const end = normalizeDateTime(coupon.endTime, true)
  return end ? parseLocalDateTime(end) : null
}

/**
 * 用户手里的这张券此刻是否可用——所有校验点（领取、我的券、下单）统一走这里，
 * 避免各处各写一套日期比较导致行为不一致。
 */
export function isUserCouponUsable(
  coupon: CouponWindow & { status: string },
  userCoupon: UserCouponWindow,
  now: Date = new Date()
): boolean {
  if (userCoupon.status !== 'active') return false
  if (coupon.status !== 'active') return false

  if (coupon.validMode === 'relative') {
    // 历史数据可能没有 expireTime，此时以券模板状态为准
    if (!userCoupon.expireTime) return true
    return new Date(userCoupon.expireTime).getTime() > now.getTime()
  }

  return isCouponInWindow(coupon, now)
}

export interface ResolvedCoupon {
  userCouponId: string
  couponId: string
  name: string
  type: string
  value: number
  minAmount: number
  stackable: boolean
  /** 仅买赠券有值：决定订单上挂哪个赠品 */
  giftName?: string
  giftQuantity?: number
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
 * 校验项：归属（必须属于当前用户且状态为 active）、有效期、叠加规则、买赠券的两条硬规则。
 * 此前订单接口只查券模板的 status，任何登录用户传任意券 id 都能享受折扣，
 * 叠加规则与每人限领也就形同虚设。
 *
 * `hasNormalItems` 由调用方按「订单里有没有正常商品」传入，而不是用 `itemsAmount > 0` 代替：
 * 0 元商品的订单金额也是 0，会把「买了东西」误判成「没买东西」。
 */
export async function resolveUserCoupons(
  userId: string,
  userCouponIds: string[] | undefined | null,
  itemsAmount: number,
  hasNormalItems: boolean = itemsAmount > 0
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

  // 统一的有效性校验：状态、券模板状态、有效期（fixed 看日期窗口 / relative 看 expireTime）
  const now = new Date()
  for (const uc of mine) {
    const c = uc.coupon
    if (uc.status !== 'active') {
      return { ok: false, error: `「${c.name}」已使用或已失效`, coupons: [], discount: 0, total: itemsAmount }
    }
    if (c.status !== 'active') {
      return { ok: false, error: `「${c.name}」已停止发放`, coupons: [], discount: 0, total: itemsAmount }
    }
    if (c.validMode === 'relative') {
      if (!isUserCouponUsable(c, uc, now)) {
        return { ok: false, error: `「${c.name}」已过期`, coupons: [], discount: 0, total: itemsAmount }
      }
    } else {
      const start = normalizeDateTime(c.startTime)
      if (start && nowStr(now) < start) {
        return { ok: false, error: `「${c.name}」还未到生效时间`, coupons: [], discount: 0, total: itemsAmount }
      }
      if (!isCouponInWindow(c, now)) {
        return { ok: false, error: `「${c.name}」已过期`, coupons: [], discount: 0, total: itemsAmount }
      }
    }
  }

  let candidates: ResolvedCoupon[] = mine.map(uc => ({
    userCouponId: uc.id,
    couponId: uc.couponId,
    name: uc.coupon.name,
    type: uc.coupon.type,
    value: uc.coupon.value,
    minAmount: uc.coupon.minAmount,
    stackable: uc.coupon.stackable,
    giftName: uc.coupon.giftName,
    giftQuantity: uc.coupon.giftQuantity
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

  // 买赠券的两条硬规则。必须在下面的剔除循环**之前**判：那段循环会按「有无金额优惠」
  // 剔除券，而买赠券的优惠恒为 0，先跑的话会把问题券悄悄吃掉、用户看不出哪里不对。
  const giftCount = candidates.filter(c => c.type === 'gift').length
  if (giftCount > 0) {
    if (!hasNormalItems) {
      return {
        ok: false,
        error: '买赠券需要同时购买其他商品，不能只用赠品下单',
        coupons: [],
        discount: 0,
        total: itemsAmount
      }
    }
    if (giftCount > 1) {
      return {
        ok: false,
        error: '一次下单最多使用一张买赠券',
        coupons: [],
        discount: 0,
        total: itemsAmount
      }
    }
  }

  // 剔除实际不产生优惠的券，避免白白核销。
  // - 满减/折扣券：逐张试算它带来的金额优惠，为 0 就剔除（如未达门槛的满减券）
  // - 买赠券：不产生金额优惠，得换把尺子——门槛够了就留下，不够才剔除
  //   （不核销、不下赠品、也不报错，与满减券未达门槛时的处理一致）
  for (const c of candidates.slice()) {
    if (!candidates.some(k => k.userCouponId === c.userCouponId)) continue
    const without = candidates.filter(k => k.userCouponId !== c.userCouponId)

    if (c.type === 'gift') {
      if (c.minAmount > 0 && itemsAmount < c.minAmount) candidates = without
      continue
    }

    const withAll = calcCouponsDiscount(itemsAmount, candidates).discount
    const withoutDiscount = calcCouponsDiscount(itemsAmount, without).discount
    if (Math.round((withAll - withoutDiscount) * 100) === 0) candidates = without
  }

  const { discount, total } = calcCouponsDiscount(itemsAmount, candidates)
  return { ok: true, coupons: candidates, discount, total }
}

/** grantCouponsToUsers 需要的券字段 */
export interface GrantableCoupon extends CouponWindow {
  id: string
  name: string
  type: string
  value: number
  minAmount: number
  giftName?: string
  giftQuantity?: number
}

/**
 * 把一批券发进一批用户的券包：券 + 站内消息 + claimed 计数，三件事一起做。
 * 手动推送（推给全部在期会员）与会员卡自动推送都走这里，避免两处各写一遍后行为分叉。
 *
 * 与自助领取的区别（既有设计，刻意保留）：**不去重**（已持有同一张券照发）、
 * **不受 perUserLimit 与各项限领规则约束**——那些是用户自助领取的上限，店主主动赠送不受此约束。
 * source 沿用 'push'：自动推送本来就是推送，不新造取值免得既有统计漏掉。
 *
 * 调用方必须传事务客户端（`tx`）：会员开通与发券要在同一个事务里，要么都成要么都不成。
 *
 * @returns perUser 每人收到几张券；total 一共写入几条 UserCoupon
 */
export async function grantCouponsToUsers(
  tx: Prisma.TransactionClient,
  userIds: string[],
  coupons: GrantableCoupon[],
  now: Date = new Date()
): Promise<{ perUser: number; total: number }> {
  const users = Array.from(new Set((userIds || []).filter(Boolean)))
  const list = (coupons || []).filter(Boolean)
  if (!users.length || !list.length) return { perUser: 0, total: 0 }

  await tx.userCoupon.createMany({
    data: users.flatMap(userId =>
      list.map(c => ({
        userId,
        couponId: c.id,
        status: 'active',
        source: 'push',
        claimTime: now,
        // 同一批发出的券共用一个到期时刻，避免逐条 new Date() 造成毫秒级差异
        expireTime: userCouponExpireAt(c, now)
      }))
    )
  })

  await tx.notification.createMany({
    data: users.flatMap(userId =>
      list.map(c => ({
        userId,
        title: '收到一张会员专属优惠券',
        content: `${c.name}：${couponValueText(c)}，已放入你的券包`,
        type: 'coupon',
        link: '/coupons'
      }))
    )
  })

  for (const c of list) {
    await tx.coupon.update({
      where: { id: c.id },
      data: { claimed: { increment: users.length } }
    })
  }

  return { perUser: list.length, total: users.length * list.length }
}
