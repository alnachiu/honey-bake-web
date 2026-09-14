export function formatPrice(price: number): string {
  return (price || 0).toFixed(2)
}

export function formatDate(date: string | Date): string {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${min}`
}

export function getOrderStatusText(status: string): string {
  const map: Record<string, string> = {
    'pending': '待付款',
    'paid': '待制作',
    'making': '制作中',
    'delivering': '配送中',
    'completed': '已完成',
    'cancelled': '已取消',
  }
  return map[status] || '未知'
}

export function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    'pending': '#E6A23C',
    'paid': '#67C23A',
    'making': '#409EFF',
    'delivering': '#E8806A',
    'completed': '#909399',
    'cancelled': '#C0C4CC',
  }
  return map[status] || '#909399'
}

export function generateOrderNo(): string {
  const now = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `HB${now}${rand}`
}

export function parseImages(images: string): string[] {
  try {
    return JSON.parse(images)
  } catch {
    return images ? [images] : []
  }
}

export function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags)
  } catch {
    return tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
  }
}

/**
 * 中国大陆手机号格式校验。
 * 手机号是会员卡的凭证，所以这个判断在客户端（表单即时提示）和服务端
 * （phone-login / 绑定 / 游客下单 的入库前校验）都要走同一份实现——
 * 之前只写在 login 和 checkout 两个页面的内联正则里，直接打接口可以塞进任意字符串。
 */
export function isValidPhone(phone?: string | null): boolean {
  return typeof phone === 'string' && /^1[3-9]\d{9}$/.test(phone)
}

/** 本地日期 YYYY-MM-DD，用于与 Coupon.startTime / endTime 做字符串比较 */
export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 本地时间 YYYY-MM-DDTHH:mm（精确到分），与 Coupon.startTime / endTime 同格式。
 * 用字符串比较判有效期，避免时区换算带来的偏差。
 */
export function nowStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * 把券的有效期字段规格化成 YYYY-MM-DDTHH:mm。
 * 存量数据只有日期（YYYY-MM-DD），按「开始取当天 00:00、结束取当天 23:59」补齐，
 * 保证旧券的语义不变（当天全天有效）。
 */
export function normalizeDateTime(value: string, endOfDay = false): string {
  const s = (value || '').trim()
  if (!s) return ''
  if (s.includes('T')) return s.length >= 16 ? s.slice(0, 16) : `${s}:00`
  return `${s}T${endOfDay ? '23:59' : '00:00'}`
}

/**
 * 把 YYYY-MM-DDTHH:mm 解析成本地时区的 Date。
 * 不用 `new Date(string)`——那种写法对 "YYYY-MM-DD HH:mm" 这类格式在各引擎表现不一致。
 */
export function parseLocalDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value || '').trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
}

/** 券卡片上的一行有效期说明 */
export function couponExpireText(c: {
  validMode?: string
  validDays?: number
  endTime?: string
}): string {
  if (c.validMode === 'relative') return `领取后 ${c.validDays || 0} 天内有效`
  const e = normalizeDateTime(c.endTime || '', true)
  return e ? `有效期至 ${e.replace('T', ' ')}` : ''
}

/** 券的完整有效期区间说明，管理端用 */
export function couponValidityText(c: {
  validMode?: string
  validDays?: number
  startTime?: string
  endTime?: string
}): string {
  if (c.validMode === 'relative') return `领取后 ${c.validDays || 0} 天内有效`
  const s = normalizeDateTime(c.startTime || '')
  const e = normalizeDateTime(c.endTime || '', true)
  if (s && e) return `${s.replace('T', ' ')} ~ ${e.replace('T', ' ')}`
  if (e) return `有效期至 ${e.replace('T', ' ')}`
  if (s) return `${s.replace('T', ' ')} 起`
  return ''
}

/** 券的短标签，用在券面那个小方块上 */
export function couponAmountLabel(c: { type: string; value: number }): string {
  if (c.type === 'gift') return '🎁'
  if (c.type === 'discount') return `${c.value}折`
  return `¥${c.value}`
}

/**
 * 券的完整说明文案，用在通知正文与列表副标题。
 * 以前这段是按 type 二分的三元式散在各处，加了买赠券之后会渲染成「满 0 减 0」。
 */
export function couponValueText(c: {
  type: string
  value: number
  minAmount?: number
  giftName?: string
  giftQuantity?: number
}): string {
  if (c.type === 'gift') {
    return c.giftName ? `送${c.giftName} ×${c.giftQuantity || 0}` : '赠品券'
  }
  if (c.type === 'discount') return `${c.value} 折`
  return (c.minAmount || 0) > 0 ? `满 ${c.minAmount} 减 ${c.value}` : `立减 ${c.value} 元`
}

/** 买赠券带的赠品；非买赠券或赠品信息不全时返回 null */
export function giftFromCoupon(c: {
  type?: string
  giftName?: string
  giftQuantity?: number
} | null | undefined): { giftName: string; giftQuantity: number } | null {
  if (!c || c.type !== 'gift') return null
  const name = (c.giftName || '').trim()
  const quantity = Number(c.giftQuantity)
  if (!name || !Number.isInteger(quantity) || quantity < 1) return null
  return { giftName: name, giftQuantity: quantity }
}

export const PERIOD_TYPES = ['day', 'week', 'month'] as const

const PERIOD_LABEL: Record<string, string> = { day: '每天', week: '每周', month: '每月' }

/**
 * 自然周期的起点（本地时区）：day = 当天 00:00，week = 本周一 00:00，month = 本月 1 号 00:00。
 * 用本地时间构造而不是解析字符串，避免时区换算把周期边界挪到前一天。
 */
export function periodStart(periodType: string, now: Date = new Date()): Date | null {
  if (periodType === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (periodType === 'week') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 让周一成为一周的第一天
    return d
  }
  if (periodType === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return null
}

export interface CouponLimitConfig {
  perUserLimit?: number
  rollingDays?: number
  rollingLimit?: number
  periodType?: string
  periodCount?: number
}

export interface ClaimLimitState {
  /** 该用户在这张券上一共领过几张 */
  totalCount: number
  /** 滚动窗口（最近 N 天）内领过几张 */
  windowCount: number
  /** 当前自然周期内领过几张 */
  periodUsed: number
  blocked: boolean
  /** blocked 时给用户看的原因；未触限时为空串 */
  reason: string
  /** 所有启用的规则里最紧的那条还剩几张；一条都没启用时返回 -1（不限） */
  remain: number
}

const toCount = (v: unknown): number => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * 领取限制的唯一判定入口：领取接口（拦不拦）与列表接口（还剩几张）共用，
 * 避免两边各写一套算法后悄悄漂移——这正是 calcOrderAmount 当初被抽出来的理由。
 *
 * 三条规则可同时启用，互不覆盖：
 *   ① perUserLimit  总量上限（不限时间）
 *   ② rollingDays + rollingLimit  滚动窗口：最近 N 天内最多 M 张
 *   ③ periodType + periodCount    自然周期：每天/每周/每月最多 K 张
 */
export function evaluateClaimLimits(
  coupon: CouponLimitConfig,
  claimTimes: (string | Date)[] | null | undefined,
  now: Date = new Date()
): ClaimLimitState {
  const times = (claimTimes || [])
    .map(t => new Date(t).getTime())
    .filter(t => Number.isFinite(t))
  const totalCount = times.length

  const perUserLimit = toCount(coupon.perUserLimit)
  const rollingDays = toCount(coupon.rollingDays)
  const rollingLimit = toCount(coupon.rollingLimit)
  const periodType = (PERIOD_TYPES as readonly string[]).includes(coupon.periodType || '')
    ? (coupon.periodType as string)
    : 'none'
  const periodCount = toCount(coupon.periodCount)

  const windowStart = rollingDays ? now.getTime() - rollingDays * 86400000 : 0
  const windowCount = rollingDays ? times.filter(t => t >= windowStart).length : 0

  const pStart = periodStart(periodType, now)
  const periodUsed = pStart ? times.filter(t => t >= pStart.getTime()).length : 0

  const remainders: number[] = []
  if (perUserLimit) remainders.push(perUserLimit - totalCount)
  if (rollingDays && rollingLimit) remainders.push(rollingLimit - windowCount)
  if (pStart && periodCount) remainders.push(periodCount - periodUsed)

  let blocked = false
  let reason = ''
  if (perUserLimit && totalCount >= perUserLimit) {
    blocked = true
    reason = `每人最多可领取 ${perUserLimit} 张，您已领完`
  } else if (rollingDays && rollingLimit && windowCount >= rollingLimit) {
    blocked = true
    reason = `最近 ${rollingDays} 天内最多可领取 ${rollingLimit} 张，您已领完`
  } else if (pStart && periodCount && periodUsed >= periodCount) {
    blocked = true
    reason = `${PERIOD_LABEL[periodType] || ''}最多可领取 ${periodCount} 张，您已领完`
  }

  return {
    totalCount,
    windowCount,
    periodUsed,
    blocked,
    reason,
    remain: remainders.length ? Math.max(0, Math.min(...remainders)) : -1
  }
}

/** 券卡片上那行限领说明，只拼启用了的规则 */
export function claimLimitHint(coupon: CouponLimitConfig): string {
  const parts: string[] = []
  const perUserLimit = toCount(coupon.perUserLimit)
  const rollingDays = toCount(coupon.rollingDays)
  const rollingLimit = toCount(coupon.rollingLimit)
  const periodType = (PERIOD_TYPES as readonly string[]).includes(coupon.periodType || '')
    ? (coupon.periodType as string)
    : 'none'
  const periodCount = toCount(coupon.periodCount)

  if (perUserLimit) parts.push(`每人限领 ${perUserLimit} 张`)
  if (rollingDays && rollingLimit) parts.push(`每 ${rollingDays} 天限领 ${rollingLimit} 张`)
  if (periodType !== 'none' && periodCount) parts.push(`${PERIOD_LABEL[periodType]}限领 ${periodCount} 张`)
  return parts.join(' · ')
}

export interface OrderAmountInput {
  itemsAmount: number
  coupons?: CouponLike[] | null
  /** 会员折扣率：1 = 非会员或不打折，0.95 = 95 折 */
  memberDiscountRate?: number
}

export interface OrderAmountResult {
  itemsAmount: number
  couponDiscount: number
  memberDiscount: number
  deliveryFee: number
  totalAmount: number
}

/**
 * 订单金额的**唯一**计算入口（前端结算页与下单接口共用，避免两边算法漂移）。
 *
 * 顺序：① 优惠券（门槛按原始商品金额判断，先满减再打折）
 *      ② 会员折扣（作用于券后金额）
 *      ③ 运费（按原始商品金额判断是否满 68 免运费）
 *
 * 会员折扣放在最后，是为了让优惠券门槛不受会员打折影响——
 * 否则会员会因为「打完折金额掉到门槛以下」而用不了本该能用的券。
 */
export function calcOrderAmount({
  itemsAmount,
  coupons,
  memberDiscountRate = 1
}: OrderAmountInput): OrderAmountResult {
  const { discount: couponDiscount } = calcCouponsDiscount(itemsAmount, coupons)

  const afterCoupon = Math.max(0, itemsAmount - couponDiscount)
  const rate = Number.isFinite(memberDiscountRate) && memberDiscountRate > 0 ? memberDiscountRate : 1
  const memberDiscount = Math.round(afterCoupon * (1 - rate) * 100) / 100

  const deliveryFee = itemsAmount >= 68 ? 0 : 5
  const totalAmount = Math.max(0, Math.round((afterCoupon - memberDiscount + deliveryFee) * 100) / 100)

  return { itemsAmount, couponDiscount, memberDiscount, deliveryFee, totalAmount }
}

/** 当前是否处于会员有效期 */
export function isMemberActive(memberExpire?: string | Date | null, at: Date = new Date()): boolean {
  if (!memberExpire) return false
  return new Date(memberExpire).getTime() > at.getTime()
}

/**
 * 计算续费后的到期时间：从「当前时间」与「原到期时间」中取较晚者起算，天数累加。
 * 会员未到期时续费是叠加而不是覆盖，过期后续费则从当下重新开始。
 */
export function extendMemberExpire(
  current: Date | string | null | undefined,
  days: number,
  from: Date = new Date()
): Date {
  const base = current && new Date(current).getTime() > from.getTime() ? new Date(current) : from
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

/** 会员还剩几天（不足一天按 1 天算）；非会员返回 0 */
export function memberRemainDays(memberExpire?: string | Date | null, at: Date = new Date()): number {
  if (!isMemberActive(memberExpire, at)) return 0
  const ms = new Date(memberExpire as any).getTime() - at.getTime()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export interface CouponLike {
  type: string
  value: number
  minAmount: number
  stackable?: boolean
  /** 仅 type=gift 用：赠品名称与数量（决定订单上那个赠品，不参与算钱） */
  giftName?: string
  giftQuantity?: number
}

/**
 * 计算多张优惠券的合计优惠。
 * 顺序固定为「先满减，再打折」：
 *   ① 满减券按【原始商品金额】判断门槛，多张额度累加，且减免总额不超过商品金额；
 *   ② 折扣券在满减后的金额上依次相乘。
 * 未达门槛的满减券不产生优惠，调用方应据此剔除，避免白白核销。
 *
 * 买赠券（type=gift）在这里**恒为 0 优惠**——它只往订单上挂赠品、不改金额，
 * 所以下面两个分支都碰不到它。也正因如此，调用方不能用「有无金额优惠」来决定
 * 它是否生效，得单独判（见 lib/coupons.ts 的 resolveUserCoupons）。
 */
export function calcCouponsDiscount(
  itemsAmount: number,
  coupons?: CouponLike[] | null
): { discount: number; total: number } {
  const list = (coupons || []).filter(Boolean)
  if (!list.length) return { discount: 0, total: itemsAmount }

  // ① 先满减
  let reduce = 0
  for (const c of list) {
    if (c.type === 'reduce' && itemsAmount >= c.minAmount) reduce += c.value
  }
  reduce = Math.min(reduce, itemsAmount)
  let amount = itemsAmount - reduce

  // ② 再打折
  for (const c of list) {
    if (c.type === 'discount') amount *= c.value / 10
  }

  amount = Math.max(0, Math.round(amount * 100) / 100)
  return {
    discount: Math.round((itemsAmount - amount) * 100) / 100,
    total: amount
  }
}

/**
 * 叠加判定：多张券同时使用时，要求每一张券自身都允许叠加
 * （即 A 可叠加 + B 不可叠加 依然不允许同时使用）。
 */
export function canStack(coupons: { stackable?: boolean }[]): boolean {
  if (coupons.length <= 1) return true
  return coupons.every(c => c.stackable === true)
}
