// 站内聊天（「联系小二」）的共用部分。
//
// 这个模块只放「两边都要用同一份」的东西：保留期常量、过期时刻换算、
// 惰性清理。页面和接口各自复制一遍保留期数字的话，改了接口忘了页面，
// 提醒条上写着的到期日就会和实际清除时间对不上——用户看到的是页面上那句话。

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

/** 消息保留天数。整条会话闲置超过这个天数就被清掉（不是逐条过期） */
export const CHAT_RETENTION_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 某个会话的清除时刻 = 最后一条消息时刻 + 7 天。
 *
 * 口径是**整个会话一起清**，不是每条消息各自从发出算起 7 天：
 * 那样会出现「同一次对话里前半段已经消失、后半段还在」的断层，
 * 对用户来说比整段消失更难理解。
 */
export function chatExpireAt(lastMessageAt: Date | string): Date {
  return new Date(new Date(lastMessageAt).getTime() + CHAT_RETENTION_DAYS * DAY_MS)
}

/**
 * 清掉闲置超过保留期的会话（消息靠外键级联一起删）。
 *
 * **惰性执行，挂在 GET /api/chat 上**：项目没有 cron，也不打算为这点事引入一个。
 * 现成的先例是 api/orders/route.ts 里「配送中超过 7 天自动完成」——
 * 同样是「下次有人来访问时顺手做掉」。双方都不再打开聊天页时会话就一直留着，
 * 那也无所谓：没人看的数据不占任何人的时间，下次任意一方打开就清掉了。
 *
 * 收 Prisma.TransactionClient 是为了将来能塞进事务；现在直接传 prisma 即可。
 */
export async function purgeExpiredChats(
  client: Prisma.TransactionClient = prisma,
  now: Date = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY_MS)
  const { count } = await client.chatConversation.deleteMany({
    where: { lastMessageAt: { lt: cutoff } }
  })
  return count
}

/** 通知正文里的消息预览：单行、截断，避免整段话灌进通知列表 */
export function chatPreview(body: string, max = 40): string {
  const flat = (body || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
