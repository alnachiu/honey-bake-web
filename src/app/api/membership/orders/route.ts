import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { isValidPhone } from '@/lib/utils'

const DAY_MS = 24 * 60 * 60 * 1000

function genMembershipOrderNo(): string {
  const now = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `MB${now}${rand}`
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: any = user.role === 'admin' ? {} : { userId: user.id }
    if (status) where.status = status

    const orders = await prisma.membershipOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { id: true, name: true } },
        // 管理员要看到是谁买的；用户看自己的单子不需要这层
        user: { select: { id: true, name: true, email: true, phone: true } }
      }
    })

    // 用户端返回自己的会员状态，省得页面再单独请求一次
    let memberExpire: Date | null = null
    if (user.role !== 'admin') {
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { memberExpire: true }
      })
      memberExpire = me?.memberExpire || null
    }

    return NextResponse.json({ orders, memberExpire })
  } catch (error: any) {
    console.error('Get membership orders error:', error)
    return NextResponse.json({ error: error.message || '获取购买记录失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // 与商品下单同理：店主不买自己的会员卡，否则会员数据会混进一个不该有的样本
    if (user.role === 'admin') {
      return NextResponse.json({ error: '管理员账号不支持购买会员卡，请使用顾客账号' }, { status: 403 })
    }

    // 会员卡以手机号为凭证：没有手机号的卡在结算时无法被识别，等于白买。
    // 前端 /member 会先弹绑定框，这里再兜一层，挡住直接打接口的情况。
    if (!isValidPhone(user.phone)) {
      return NextResponse.json({ error: '请先绑定手机号，会员卡以手机号为凭证' }, { status: 400 })
    }

    const data = await request.json()

    const planId = String(data?.planId || '')
    if (!planId) return NextResponse.json({ error: '请选择会员卡套餐' }, { status: 400 })

    const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })
    if (!plan.active) return NextResponse.json({ error: '该套餐已下架' }, { status: 400 })

    // 同一套餐已有待确认的单子就复用，避免连点生成一堆重复待付款单
    const pending = await prisma.membershipOrder.findFirst({
      where: { userId: user.id, planId, status: 'pending' }
    })
    if (pending) return NextResponse.json({ order: pending, reused: true })

    // planName / price / days 存快照，套餐后续改价改名不影响这单
    const order = await prisma.membershipOrder.create({
      data: {
        orderNo: genMembershipOrderNo(),
        userId: user.id,
        planId: plan.id,
        planName: plan.name,
        price: plan.price,
        days: plan.days,
        status: 'pending'
      }
    })

    return NextResponse.json({ order })
  } catch (error: any) {
    console.error('Create membership order error:', error)
    return NextResponse.json({ error: error.message || '下单失败' }, { status: 500 })
  }
}
