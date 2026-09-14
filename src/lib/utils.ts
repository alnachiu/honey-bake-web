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

/** 本地日期 YYYY-MM-DD，用于与 Coupon.startTime / endTime 做字符串比较 */
export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export interface CouponLike {
  type: string
  value: number
  minAmount: number
  stackable?: boolean
}

/**
 * 计算多张优惠券的合计优惠。
 * 顺序固定为「先满减，再打折」：
 *   ① 满减券按【原始商品金额】判断门槛，多张额度累加，且减免总额不超过商品金额；
 *   ② 折扣券在满减后的金额上依次相乘。
 * 未达门槛的满减券不产生优惠，调用方应据此剔除，避免白白核销。
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
