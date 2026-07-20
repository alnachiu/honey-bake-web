import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    return NextResponse.json({ user })
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
    if (data.phone !== undefined) updateData.phone = data.phone

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    })

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, phone: true, avatar: true, role: true }
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}
