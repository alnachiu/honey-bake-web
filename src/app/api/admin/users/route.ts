import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

/**
 * 店主侧的顾客检索与密码协助。
 *
 * 鉴权刻意用 getAuthUser() + 显式判角色，而不是 requireAdmin()：
 * requireAdmin() 抛的是普通 Error，被路由的 catch 接住后统一变成 500，
 * 于是「没权限」和「服务器炸了」在客户端看来一模一样。这里让它老老实实返 403。
 * 同样的写法在 api/orders/export/route.ts 已有先例。
 */
async function requireAdminUser() {
  const user = await getAuthUser()
  if (!user) return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  if (user.role !== 'admin') return { error: NextResponse.json({ error: '权限不足' }, { status: 403 }) }
  return { user }
}

/** 列表里每页最多返回多少条，防止把整张用户表一次性吐出去 */
const MAX_RESULTS = 50

/**
 * GET /api/admin/users?phone=138
 *
 * 按手机号模糊匹配顾客。不带 phone 时返回最近注册的若干位，
 * 免得店主在不知道手机号的情况下完全没法从后台找到人。
 *
 * 返回体里**绝不包含 password 哈希**：只给一个布尔 hasPassword。
 * 哈希虽然是 bcrypt，但把凭据材料送到前端是多余的暴露面——
 * 界面需要的只是「这人有密码吗」。
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser()
    if (auth.error) return auth.error

    const phone = (new URL(request.url).searchParams.get('phone') || '').trim()

    const users = await prisma.user.findMany({
      where: {
        // 只搜消费者。管理员账号不参与这个流程——清除管理员密码会把店主自己锁在门外。
        role: 'user',
        ...(phone ? { phone: { contains: phone } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_RESULTS,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        memberExpire: true,
        createdAt: true,
        password: true, // 只用来算下面的 hasPassword，不往外返回
        _count: { select: { orders: true } }
      }
    })

    return NextResponse.json({
      users: users.map(({ password, _count, ...u }) => ({
        ...u,
        hasPassword: !!password,
        orderCount: _count.orders
      }))
    })
  } catch (error: any) {
    console.error('Admin search users error:', error)
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 })
  }
}

/**
 * POST /api/admin/users  { userId, action: 'clear-password' }
 *
 * 「清除密码」= 把 password 置 null。之后该账号只能用手机号免密登录，
 * 用户可以自己在「我的」页重新设置密码（change-password 在无密码时跳过旧密码校验）。
 *
 * 注意这里**做不到**店主最初设想的「查出用户现在的密码」：password 存的是 bcrypt
 * 单向哈希，任何人都无法还原明文，这不是权限问题而是密码学的边界。
 * 所以能提供的协助只有「清除」这一种。
 *
 * 用户已有数据（订单、优惠券、会员、聊天、通知）全部保留——只动 password 一列。
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser()
    if (auth.error) return auth.error

    const { userId, action } = await request.json()
    if (!userId) return NextResponse.json({ error: '缺少用户 id' }, { status: 400 })
    if (action !== 'clear-password') {
      return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, name: true, phone: true, password: true }
    })
    if (!target) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

    // 双保险：GET 只列消费者，这里再挡一次。清除管理员密码会让店主本人
    // 也失去邮箱登录的能力，属于「一键把自己锁在门外」，必须拦住。
    if (target.role === 'admin') {
      return NextResponse.json({ error: '不能清除管理员账号的密码' }, { status: 403 })
    }

    // 无密码账号再点一次不应该报错，直接告诉调用方「本来就是免密」。
    if (!target.password) {
      return NextResponse.json({ success: true, alreadyClear: true, message: '该账号本来就是免密登录' })
    }

    // 没有手机号的账号清掉密码就彻底进不去了（登录页两条路都断）。
    // 手机号是免密登录的唯一凭据，必须先有它。
    if (!target.phone) {
      return NextResponse.json(
        { error: '该账号没有绑定手机号，清除密码后将无法登录。请让顾客先用手机号登录一次再操作' },
        { status: 400 }
      )
    }

    await prisma.user.update({ where: { id: userId }, data: { password: null } })

    // 给顾客留一条站内通知，免得他下次输密码失败时不明所以
    await prisma.notification.create({
      data: {
        userId,
        title: '🔑 密码已重置',
        content: '店主已清除你的登录密码，现在可以直接用手机号免密登录，登录后可在「我的」页重新设置密码。你的订单和数据都没有变化。',
        type: 'system',
        link: '/profile'
      }
    })

    return NextResponse.json({ success: true, message: `已清除 ${target.name || target.phone} 的密码` })
  } catch (error: any) {
    console.error('Admin clear password error:', error)
    return NextResponse.json({ error: error.message || '操作失败' }, { status: 500 })
  }
}
