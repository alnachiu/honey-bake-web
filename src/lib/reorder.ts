import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

/**
 * 店主在后台用「↑↓」调整展示顺序的共用实现，商品和优惠券各挂一个路由进来。
 *
 * 写入规则是 **sort = 下标 + 1**（从 1 起）。0 是故意空出来的，表示「还没排过序」——
 * 新建的商品/券 sort 都是 0，于是天然排在所有已排序项（1..n）之前，
 * 正好就是店主选定的「新上架的商品排在最前面」。
 *
 * 写的是绝对下标而不是「相对位移」，所以同一个顺序重复提交多少次结果都一样（幂等），
 * 连点最多是后一次覆盖前一次，不会把顺序写乱。
 *
 * ⚠️ 这里是 `sort` 的唯一写入者。**不要**顺手把 sort 加进
 * `validateCouponInput`（src/app/api/coupons/route.ts）的白名单：那个 PUT 是全量覆盖，
 * 一旦 sort 进了白名单，「隐藏/显示」开关和编辑页就会拿着重排前捕获的旧值把顺序覆盖回去。
 */
export async function reorder(
  request: Request,
  table: 'product' | 'coupon'
): Promise<NextResponse> {
  try {
    // 显式判 403，不用 requireAdmin()：它抛的是普通 Error，
    // 会被下面的 catch 吞成 500，前端拿不到「你没权限」这个信息
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const raw = body?.ids
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'ids 必须是非空数组' }, { status: 400 })
    }

    const ids = raw.map((v: unknown) => String(v))
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'ids 不能重复' }, { status: 400 })
    }

    // 只写真实存在的 id。列表拉出来之后店主可能已经删掉了某一项，
    // 那种情况静默跳过就好，不该让整次调整失败。
    const delegate = (prisma as any)[table]
    const existing = await delegate.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const alive = new Set<string>(existing.map((r: any) => r.id))

    const writes = ids
      .filter((id: string) => alive.has(id))
      .map((id: string, i: number) =>
        delegate.update({ where: { id }, data: { sort: i + 1 } })
      )

    // 数组形式的 $transaction 会把这一批当单个事务串行执行，不会写一半
    if (writes.length) await prisma.$transaction(writes)

    return NextResponse.json({ success: true, updated: writes.length })
  } catch (error) {
    console.error(`Reorder ${table} error:`, error)
    return NextResponse.json({ error: '调整顺序失败，请重试' }, { status: 500 })
  }
}
