// 只放需要访问数据库的会员逻辑。
// extendMemberExpire / memberRemainDays 这类纯函数在 utils.ts，
// 否则前端组件 import 这里会把 Prisma 一起打进浏览器包。
import { prisma } from './prisma'
import { isMemberActive } from './utils'

/** 会员折扣率上下限：低于 0.1 折等于白送，1 以上是加价，都视为无效配置归为 1 */
const MIN_RATE = 0.1

/**
 * 当前生效的会员折扣率。非会员（含过期）一律返回 1（不打折）。
 * `memberExpire` 传 null / undefined 也可安全调用。
 */
export async function getMemberDiscountRate(
  memberExpire?: Date | string | null
): Promise<number> {
  if (!isMemberActive(memberExpire)) return 1

  const setting = await prisma.shopSetting.findUnique({
    where: { id: 'default' },
    select: { memberDiscount: true }
  })
  const rate = setting?.memberDiscount ?? 1
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) return 1
  return rate < MIN_RATE ? MIN_RATE : rate
}

/**
 * 手机号即会员凭证：按号码查该号下最晚到期的那张会员卡。
 * 返回有效会员期（Date）或 null。
 *
 * 为什么取「最晚」而不是「找到的那个账号」：User.phone 不是 unique 字段，
 * 同一个号码可能挂在多个账号上（游客下单和手机号登录都会自动建号，
 * 邮箱注册的用户又可能另外绑同一号码）。既然凭证是号码，
 * 折扣就该跟着号码走，而不是跟着恰好在登录的那个账号走。
 */
export async function getMemberExpireByPhone(phone: string): Promise<Date | null> {
  const users = await prisma.user.findMany({
    where: { phone, memberExpire: { not: null } },
    select: { memberExpire: true }
  })

  let best: Date | null = null
  for (const u of users) {
    if (!u.memberExpire) continue
    if (!best || u.memberExpire > best) best = u.memberExpire
  }

  return isMemberActive(best) ? best : null
}

/**
 * 按手机号取当前生效的会员折扣率。非会员（含过期）返回 1（不打折）。
 * 只回折扣率，不回会员期——结算页的提示条不需要知道到期日。
 */
export async function getMemberDiscountRateByPhone(phone: string): Promise<number> {
  return getMemberDiscountRate(await getMemberExpireByPhone(phone))
}

