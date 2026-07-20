import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signToken, setAuthCookie, JWTPayload } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json()

    if (!email || !name || !password) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少6位' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, name, password: hashedPassword, role: 'user' }
    })

    const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role }
    const token = signToken(payload)

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: '', avatar: '' }
    })

    const cookieHeader = setAuthCookie(token)
    Object.entries(cookieHeader).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: '注册失败' }, { status: 500 })
  }
}
