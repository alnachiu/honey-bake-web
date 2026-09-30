import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

/** 只接受这五个字段。请求体里其它东西（尤其 userId）一律忽略。 */
const FIELDS = ['name', 'phone', 'region', 'detail', 'isDefault'] as const

type AddressPatch = {
  name?: string
  phone?: string
  region?: string
  detail?: string
  isDefault?: boolean
}

/**
 * 从请求体里挑出白名单字段并做基础校验。
 * 顺带堵住「传 userId 把地址过户到别人名下」这条路——原写法 `data` 整个透传，
 * 请求体里塞什么就写什么。
 */
function pick(body: any, { requireCore }: { requireCore: boolean }): AddressPatch | string {
  const patch: AddressPatch = {}

  for (const key of FIELDS) {
    if (!(key in body)) continue
    if (key === 'isDefault') {
      patch.isDefault = Boolean(body.isDefault)
      continue
    }
    const value = typeof body[key] === 'string' ? body[key] : ''
    patch[key] = value.trim()
  }

  // 姓名/电话/详细地址是必填项。PUT 时只校验**被提交的**字段，
  // 这样局部更新（比如只切换默认地址，只传 { id, isDefault: true }）不会被误拒。
  for (const key of ['name', 'phone', 'detail'] as const) {
    if (requireCore && !patch[key]) return `请填写${key === 'name' ? '收货人' : key === 'phone' ? '手机号' : '详细地址'}`
    if (!requireCore && key in patch && !patch[key]) return '内容不能为空'
  }

  return patch
}

export async function GET() {
  try {
    const user = await requireAuth()
    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    })
    return NextResponse.json({ addresses })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const data = await request.json()

    const patch = pick(data, { requireCore: true })
    if (typeof patch === 'string') return NextResponse.json({ error: patch }, { status: 400 })

    // 第一条地址自动成为默认，否则用户在结算页会看到「一个地址都没选中」
    const isFirst = (await prisma.address.count({ where: { userId: user.id } })) === 0
    const isDefault = patch.isDefault || isFirst

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false }
      })
    }

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        name: patch.name!,
        phone: patch.phone!,
        region: patch.region || '',
        detail: patch.detail!,
        isDefault
      }
    })

    return NextResponse.json({ address })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuth()
    const { id, ...data } = await request.json()
    if (!id) return NextResponse.json({ error: '缺少地址 id' }, { status: 400 })

    const patch = pick(data, { requireCore: false })
    if (typeof patch === 'string') return NextResponse.json({ error: patch }, { status: 400 })
    if (!Object.keys(patch).length) return NextResponse.json({ error: '没有要修改的内容' }, { status: 400 })

    // 归属校验和写入合并成一次带 userId 条件的 updateMany。
    // 原写法是 update({ where: { id }, data })：只要 id 存在就能改，
    // 任何登录用户都能改别人的收货地址（也就能把别人的订单寄到自己家）。
    // 越权时 count = 0，返回 404——不区分「不存在」和「不是你的」，
    // 免得把「这个 id 存在」这个信息泄露出去。
    const { count } = await prisma.address.updateMany({
      where: { id, userId: user.id },
      data: patch
    })
    if (count === 0) return NextResponse.json({ error: '地址不存在' }, { status: 404 })

    // 设为默认要把其它地址的默认取消掉。放在确认归属**之后**，
    // 否则拿别人的 id 也能把对方所有地址的默认标记清空。
    if (patch.isDefault) {
      await prisma.address.updateMany({
        where: { userId: user.id, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      })
    }

    const address = await prisma.address.findUnique({ where: { id } })
    return NextResponse.json({ address })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth()
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: '缺少地址 id' }, { status: 400 })

    const target = await prisma.address.findFirst({ where: { id, userId: user.id } })
    if (!target) return NextResponse.json({ error: '地址不存在' }, { status: 404 })

    // 地址可以被随意删除：历史订单的收货信息在下单时就已快照到 Order 上
    // （receiverName 等四列），不依赖这条 Address 行还活着。
    await prisma.address.delete({ where: { id } })

    // 删掉的是默认地址时，把剩下最新的一条顶上来。没有这个兜底，
    // 用户删完默认地址后结算页会「一个都没选中」，而他完全不知道原因。
    if (target.isDefault) {
      const next = await prisma.address.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      })
      if (next) {
        await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
