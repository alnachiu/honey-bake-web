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

export function calcDiscount(
  itemsAmount: number,
  coupon?: { type: string; value: number; minAmount: number } | null
): { discount: number; total: number } {
  if (!coupon) return { discount: 0, total: itemsAmount }

  if (coupon.type === 'reduce' && itemsAmount >= coupon.minAmount) {
    return {
      discount: coupon.value,
      total: Math.max(0, itemsAmount - coupon.value)
    }
  }

  if (coupon.type === 'discount') {
    const rate = coupon.value / 10
    const discounted = itemsAmount * (1 - rate)
    return {
      discount: Math.round(discounted * 100) / 100,
      total: Math.round(itemsAmount * rate * 100) / 100
    }
  }

  return { discount: 0, total: itemsAmount }
}
