import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie } from '@/lib/auth'
import { isValidPhone } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const { phone, name } = await request.json()
    if (!isValidPhone(phone)) {
      // 这里只按手机号发登录态、不看密码，格式必须卡死，
      // 否则直接打接口能塞进任意字符串并创建一个 wx_xxx@honeybake.com 垃圾账号
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 })
    }

    // 查找是否已有该手机号用户。
    // **必须**限定 role: 'user'。店主账号也存在这张表里，prisma/seed.ts 给他设的
    // phone 就是 13800138000，而登录页默认停在手机号 tab——不加这个条件，
    // 任何人在登录框里敲 13800138000 就能拿到店主会话，且全程不需要密码。
    let user = await prisma.user.findFirst({ where: { phone, role: 'user' }, orderBy: { createdAt: 'asc' } })

    if (user) {
      // 已有账号，直接登录
      const token = signToken({ userId: user.id, email: user.email, role: user.role })
      const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar, memberExpire: user.memberExpire },
        isNew: false
      })
      const cookieHeader = setAuthCookie(token)
      Object.entries(cookieHeader).forEach(([key, value]) => response.headers.set(key, value))
      return response
    }

    // 走到这里说明没有**消费者**占用这个号。但如果它属于某个管理员账号，
    // 就不能再自动建一个同号的消费者号：两个账号共用一个手机号之后，
    // 手机号登录命中哪一个只取决于建号时间顺序，是个埋雷。
    const takenByAdmin = await prisma.user.findFirst({
      where: { phone, role: 'admin' },
      select: { id: true }
    })
    if (takenByAdmin) {
      return NextResponse.json({ error: '该手机号暂不可用，请联系店主' }, { status: 400 })
    }

    // 新用户，自动创建账号。
    // password 写 null 而不是随机哈希：这个账号本来就只靠手机号登录，
    // 存一个谁都拿不到的哈希毫无意义，还让「有无密码」这件事变得不可判定。
    const email = `wx_${phone}@honeybake.com`

    user = await prisma.user.create({
      data: {
        email,
        name: name || phone.slice(0, 3) + '****' + phone.slice(-4),
        password: null,
        phone,
        role: 'user'
      }
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar },
      isNew: true,
      message: '账号已自动创建，下次可用手机号直接登录'
    })
    const cookieHeader = setAuthCookie(token)
    Object.entries(cookieHeader).forEach(([key, value]) => response.headers.set(key, value))
    return response
  } catch (error) {
    console.error('Phone login error:', error)
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
