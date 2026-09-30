/**
 * 订单收货信息的统一读取口径。
 *
 * 为什么需要这个函数：订单上的 addressId 只是个**引用**，顾客在「地址管理」里
 * 改了或删了地址，历史订单读出来的收货信息就会跟着变、或者直接空白。所以下单时
 * 会把当时的收货信息快照到 Order 的 receiverName/Phone/Region/Detail 四列上。
 *
 * 但那四列是后加的，**存量老订单没有快照**。如果读取处只认快照，老订单会突然
 * 全变成空白地址。所以口径统一成「优先快照、快照为空再回退关联地址」——
 * 老单靠回退照常显示，新单靠快照不受后续改动影响。
 *
 * 放在这里而不是各页面各写一遍：三处读取（消费者订单详情、店主订单列表、CSV 导出）
 * 一旦有一处口径不一致，就会出现「页面上显示的地址和导出的对不上」这种极难查的问题。
 *
 * 只依赖类型、不 import 服务端模块，所以客户端组件也能直接用。
 */

export type OrderReceiverFields = {
  receiverName?: string | null
  receiverPhone?: string | null
  receiverRegion?: string | null
  receiverDetail?: string | null
}

export type AddressFields = {
  name?: string | null
  phone?: string | null
  region?: string | null
  detail?: string | null
}

export type Receiver = {
  name: string
  phone: string
  region: string
  detail: string
}

/**
 * 解析出订单的收货信息。
 * 四条都为空时返回 null，让调用方能沿用 `{receiver && ...}` 这种「没有就不渲染」的写法。
 */
export function resolveReceiver(
  order: OrderReceiverFields | null | undefined,
  address?: AddressFields | null
): Receiver | null {
  if (!order) return null

  const name = order.receiverName || address?.name || ''
  const phone = order.receiverPhone || address?.phone || ''
  const region = order.receiverRegion || address?.region || ''
  const detail = order.receiverDetail || address?.detail || ''

  // 只判 name/phone/detail：region 在很多地区本来就是空的，
  // 单凭它为空就判「没有收货信息」会把正常订单藏掉。
  if (!name && !phone && !detail) return null

  return { name, phone, region, detail }
}

/** 拼成一行，用于列表和 CSV 这类只想要一个字符串的地方 */
export function formatReceiver(receiver: Receiver | null): string {
  if (!receiver) return ''
  return [receiver.region, receiver.detail].filter(Boolean).join(' ')
}
