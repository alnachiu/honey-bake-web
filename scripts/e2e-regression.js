/* 上一轮修过的行为在本轮改动后是否仍然成立：
   每人限领 / 叠加拦截 / 下单事务回滚 / 编辑有效期立即生效 / relative 券过期 */
const BASE = process.argv[2] || 'http://localhost:3100'
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

function makeClient() {
  let cookie = ''
  return {
    async req(path, opts = {}) {
      const res = await fetch(BASE + path, {
        ...opts,
        headers: {
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...(opts.headers || {})
        }
      })
      for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
        const pair = c.split(';')[0]
        if (pair.startsWith('honeybake_token=') && !pair.endsWith('=')) cookie = pair
      }
      let data = null
      try { data = await res.json() } catch {}
      return { status: res.status, ok: res.ok, data }
    }
  }
}

const FUTURE_END = '2030-12-31T23:59'
const PAST_END = '2020-01-01T23:59'

async function main() {
  const stamp = Date.now()
  const email = `e2e_reg_${stamp}@test.com`

  const admin = makeClient()
  const login = await admin.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' }) })
  if (!login.ok) { console.log('管理员登录失败'); process.exit(1) }

  const u = makeClient()
  await u.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, name: '回归测试', password: 'Test123456' }) })
  const me = await prisma.user.findUnique({ where: { email } })
  const userId = me.id

  const product = await prisma.product.findFirst({ select: { id: true, name: true } })
  const makeItems = (price = 200) => [{ productId: product.id, name: product.name, price, quantity: 1, unit: '份' }]

  const created = []
  const mkCoupon = async (body) => {
    const r = await admin.req('/api/coupons', { method: 'POST', body: JSON.stringify(body) })
    if (r.ok) created.push(r.data.coupon.id)
    return r.data.coupon
  }
  const claim = (id) => u.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: id }) })
  const activeUC = (couponId) => prisma.userCoupon.findFirst({ where: { userId, couponId, status: 'active' } })

  console.log('\n== 1. 每人限领 ==')
  const limit1 = await mkCoupon({
    name: '回归限领1', type: 'reduce', value: 5, minAmount: 0, stock: 0,
    perUserLimit: 1, stackable: false, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END
  })
  const c1 = await claim(limit1.id)
  ok('第一次领取成功', c1.ok && c1.data.success, JSON.stringify(c1.data))
  const c2 = await claim(limit1.id)
  ok('第二次领取被限领拦截', c2.status === 400, `status=${c2.status} ${JSON.stringify(c2.data)}`)

  const listAfter = await u.req('/api/coupons')
  const row = listAfter.data.coupons.find(c => c.id === limit1.id)
  ok('列表返回 reachedLimit 与 remainForMe=0', row?.reachedLimit === true && row?.remainForMe === 0, JSON.stringify(row && { r: row.reachedLimit, m: row.remainForMe }))

  console.log('\n== 2. 叠加拦截 ==')
  const noStackA = await mkCoupon({ name: '回归不叠加A', type: 'reduce', value: 10, minAmount: 0, stock: 0, perUserLimit: 1, stackable: false, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END })
  const noStackB = await mkCoupon({ name: '回归不叠加B', type: 'reduce', value: 10, minAmount: 0, stock: 0, perUserLimit: 1, stackable: true, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END })
  await claim(noStackA.id)
  await claim(noStackB.id)
  const ucA = await activeUC(noStackA.id)
  const ucB = await activeUC(noStackB.id)

  const both = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucA.id, ucB.id], address: { name: 'T', phone: '13800000000', detail: '测试' } })
  })
  ok('A 不可叠加时两张一起被拒', both.status === 400, `status=${both.status} ${JSON.stringify(both.data)}`)

  const stillActive = await prisma.userCoupon.count({ where: { id: { in: [ucA.id, ucB.id] }, status: 'active' } })
  ok('被拒后两张券都还在', stillActive === 2, `active=${stillActive}`)

  // 都允许叠加时应当通过
  const stackA = await mkCoupon({ name: '回归可叠加A', type: 'reduce', value: 10, minAmount: 0, stock: 0, perUserLimit: 1, stackable: true, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END })
  const stackB = await mkCoupon({ name: '回归可叠加B', type: 'reduce', value: 10, minAmount: 0, stock: 0, perUserLimit: 1, stackable: true, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END })
  await claim(stackA.id)
  await claim(stackB.id)
  const ucSA = await activeUC(stackA.id)
  const ucSB = await activeUC(stackB.id)
  const okStack = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucSA.id, ucSB.id], address: { name: 'T', phone: '13800000000', detail: '测试' } })
  })
  ok('双方都可叠加时两张一起生效', okStack.ok && okStack.data.order.couponDiscount === 20, JSON.stringify(okStack.data.order && { d: okStack.data.order.couponDiscount, t: okStack.data.order.totalAmount }))

  const burnedOther = await prisma.userCoupon.count({ where: { id: { in: [ucA.id, ucB.id] }, status: 'active' } })
  ok('之前被拒的两张券未被误核销', burnedOther === 2, `active=${burnedOther}`)

  console.log('\n== 3. 下单失败时事务回滚 ==')
  const fresh = await mkCoupon({ name: '回归回滚券', type: 'reduce', value: 30, minAmount: 0, stock: 0, perUserLimit: 1, stackable: false, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: FUTURE_END })
  await claim(fresh.id)
  const ucFresh = await activeUC(fresh.id)

  const beforeOrders = await prisma.order.count({ where: { userId } })
  // 用不存在的地址 id 触发失败：券已核销但订单创建失败
  const badOrder = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucFresh.id], addressId: 'not-a-real-address-id' })
  })
  ok('无效地址导致下单失败', !badOrder.ok, `status=${badOrder.status}`)
  const afterOrders = await prisma.order.count({ where: { userId } })
  ok('没有产生残留订单', afterOrders === beforeOrders, `${beforeOrders} → ${afterOrders}`)
  const ucAfterRollback = await prisma.userCoupon.findUnique({ where: { id: ucFresh.id } })
  ok('券未被白白烧掉（事务回滚）', ucAfterRollback.status === 'active', `status=${ucAfterRollback.status}`)

  console.log('\n== 4. 编辑有效期立即生效 ==')
  // 先把券的有效期改到过去，用户手里的券应立刻失效
  const past = await admin.req('/api/coupons', {
    method: 'PUT',
    body: JSON.stringify({
      id: fresh.id, name: '回归回滚券', type: 'reduce', value: 30, minAmount: 0, stock: 0,
      perUserLimit: 1, stackable: false, validMode: 'fixed', startTime: '2020-01-01T00:00', endTime: PAST_END
    })
  })
  ok('编辑为已过期时间段', past.ok, JSON.stringify(past.data))

  const expiredOrder = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucFresh.id], address: { name: 'T', phone: '13800000000', detail: '测试' } })
  })
  ok('过期后下单被拒', expiredOrder.status === 400 && /过期|生效/.test(expiredOrder.data?.error || ''), JSON.stringify(expiredOrder.data))

  const wallet = await u.req('/api/coupons/claim')
  const walletRow = wallet.data.coupons.find(c => c.userCouponId === ucFresh.id)
  ok('券包标记 usable=false', walletRow?.usable === false, JSON.stringify(walletRow && { usable: walletRow.usable }))

  const centerList = await u.req('/api/coupons')
  ok('已过期的券不再出现在可领列表', !centerList.data.coupons.some(c => c.id === fresh.id))

  console.log('\n== 5. relative 券按 expireTime 判过期 ==')
  const relCoupon = await mkCoupon({ name: '回归相对过期', type: 'discount', value: 9, minAmount: 0, stock: 0, perUserLimit: 1, stackable: false, validMode: 'relative', validDays: 30 })
  await claim(relCoupon.id)
  const ucRel = await activeUC(relCoupon.id)

  const okUse = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(200), userCouponIds: [ucRel.id], address: { name: 'T', phone: '13800000000', detail: '测试' } })
  })
  ok('未过期的 relative 券可用', okUse.ok && okUse.data.order.couponDiscount === 20, JSON.stringify(okUse.data.order && { d: okUse.data.order.couponDiscount }))

  // 把这张券的 expireTime 手动改成过去，模拟到期
  const past2 = await mkCoupon({ name: '回归相对过期2', type: 'discount', value: 9, minAmount: 0, stock: 0, perUserLimit: 1, stackable: false, validMode: 'relative', validDays: 30 })
  await claim(past2.id)
  const ucPast = await activeUC(past2.id)
  await prisma.userCoupon.update({ where: { id: ucPast.id }, data: { expireTime: new Date(Date.now() - 86400000) } })

  const expiredRel = await u.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucPast.id], address: { name: 'T', phone: '13800000000', detail: '测试' } })
  })
  ok('超过 expireTime 后下单被拒', expiredRel.status === 400 && /过期/.test(expiredRel.data?.error || ''), JSON.stringify(expiredRel.data))

  const wallet2 = await u.req('/api/coupons/claim')
  ok('过期 relative 券在券包里 usable=false', wallet2.data.coupons.find(c => c.userCouponId === ucPast.id)?.usable === false)

  console.log('\n== 6. 非会员不能用会员价 / 别人的券不能用 ==')
  const other = makeClient()
  const email2 = `e2e_reg2_${stamp}@test.com`
  await other.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: email2, name: '旁观者', password: 'Test123456' }) })
  const steal = await other.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: makeItems(), userCouponIds: [ucSB.id], address: { name: 'T', phone: '13800000009', detail: '测试' } })
  })
  ok('不能用别人的券下单', steal.status === 400, `status=${steal.status} ${JSON.stringify(steal.data)}`)

  // 清理
  const ids = (await prisma.userCoupon.findMany({ where: { userId }, select: { id: true } })).map(x => x.id)
  const orders = await prisma.order.findMany({ where: { userId }, select: { id: true } })
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map(o => o.id) } } })
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.address.deleteMany({ where: { userId } })
  await prisma.userCoupon.deleteMany({ where: { id: { in: ids } } })
  await prisma.coupon.deleteMany({ where: { id: { in: created } } })

  const others = await prisma.user.findMany({ where: { email: { in: [email, email2] } }, select: { id: true } })
  const otherIds = others.map(o => o.id)
  if (otherIds.length) {
    const o2 = await prisma.order.findMany({ where: { userId: { in: otherIds } }, select: { id: true } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: o2.map(x => x.id) } } })
    await prisma.order.deleteMany({ where: { userId: { in: otherIds } } })
    await prisma.address.deleteMany({ where: { userId: { in: otherIds } } })
    await prisma.userCoupon.deleteMany({ where: { userId: { in: otherIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: otherIds } } })
    await prisma.user.deleteMany({ where: { id: { in: otherIds } } })
  }
  console.log('\n（已清理本次回归数据）')

  console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => {
  console.error('脚本异常:', e)
  await prisma.$disconnect()
  process.exit(1)
})
