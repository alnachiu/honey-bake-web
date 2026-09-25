// 面向店主的站内通知。
//
// Notification 表本身只有 userId，没有「收件人是管理员」这种概念——店主也是
// 一个普通账号（role='admin'），所以「通知店主」就是把通知抄送给每一个
// role='admin' 的账号各一份。这样后台消息中心可以直接复用消费者端的
// /api/notifications 和 /messages 页面，不必另建一张表。
import { Prisma } from '@prisma/client'

export interface AdminNotice {
  title: string
  content?: string
  /** 复用消费者端的类型图标：system | coupon | member */
  type?: string
  /** 点击通知后跳转的路径，如 /admin/orders?orderId=xxx */
  link?: string
}

/**
 * 给所有管理员账号各发一条通知。
 *
 * 首参收 Prisma.TransactionClient（与 lib/coupons.ts 的 grantCouponsToUsers 一致），
 * 因此既能放进 prisma.$transaction 里和业务操作同生共死，也能直接把 prisma 传进来。
 *
 * 没有任何管理员账号时静默跳过——createMany 传空数组是安全的，但提前 return
 * 更省一次数据库往返。
 */
export async function notifyAdmins(
  client: Prisma.TransactionClient,
  notice: AdminNotice
): Promise<number> {
  const admins = await client.user.findMany({
    where: { role: 'admin' },
    select: { id: true }
  })
  if (!admins.length) return 0

  await client.notification.createMany({
    data: admins.map(a => ({
      userId: a.id,
      title: notice.title,
      content: notice.content || '',
      type: notice.type || 'system',
      link: notice.link || ''
    }))
  })

  return admins.length
}
