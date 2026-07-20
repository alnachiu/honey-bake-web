import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signToken, setAuthCookie, hashPassword } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { phone, name } = await request.json()
    if (!phone) {
      return NextResponse.json({ error: '请输入手机号' }, { status: 400 })
    }

    // 查找是否已有该手机号用户
    let user = await prisma.user.findFirst({ where: { phone } })

    if (user) {
      // 已有账号，直接登录
      const token = signToken({ userId: user.id, email: user.email, role: user.role })
      const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar },
        isNew: false
      })
      const cookieHeader = setAuthCookie(token)
      Object.entries(cookieHeader).forEach(([key, value]) => response.headers.set(key, value))
      return response
    }

    // 新用户，自动创建账号
    const email = `wx_${phone}@honeybake.com`
    const randomPassword = Math.random().toString(36).slice(-10) + 'Ab1!'
    const hashedPwd = await hashPassword(randomPassword)

    user = await prisma.user.create({
      data: {
        email,
        name: name || phone.slice(0, 3) + '****' + phone.slice(-4),
        password: hashedPwd,
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
