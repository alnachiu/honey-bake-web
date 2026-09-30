import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isValidPhone } from '@/lib/utils'

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    // hasPassword 决定「我的」页那块表单是「修改密码」还是「设置密码」。
    // 单独查一次而不是塞进 getAuthUser()：后者的返回值会被多个路由直接
    // 序列化给前端，把 password 带进去等于到处漏哈希。
    // 也不能缓存到前端：店主随时可能在后台把密码清掉。
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true }
    })
    return NextResponse.json({ user: { ...user, hasPassword: !!row?.password } })
  } catch (error) {
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const data = await request.json()
    const updateData: any = {}
    if (data.avatar !== undefined) updateData.avatar = data.avatar
    if (data.name !== undefined) updateData.name = data.name

    if (data.phone !== undefined) {
      const phone = String(data.phone).trim()
      if (!isValidPhone(phone)) {
        return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 })
      }
      // 手机号是会员卡的凭证，一个号只能挂在一个账号上——否则「凭此号享会员折扣」
      // 会同时命中两个账号，订单归属和折扣都会变得不确定。
      // 注：User.phone 不能加 @unique（存量数据里多个空串 `''` 会直接冲突），
      // 所以唯一性只能在应用层守。
      const taken = await prisma.user.findFirst({
        where: { phone, NOT: { id: user.id } },
        select: { id: true }
      })
      if (taken) {
        return NextResponse.json({ error: '该手机号已绑定其他账号，请直接用手机号登录' }, { status: 400 })
      }
      updateData.phone = phone
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, phone: true, avatar: true, role: true, memberExpire: true, password: true }
    })
    if (!updatedUser) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

    // 与 GET 同口径：只暴露「有没有密码」这个布尔，不返回哈希本身
    const { password, ...rest } = updatedUser
    return NextResponse.json({ user: { ...rest, hasPassword: !!password } })
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
