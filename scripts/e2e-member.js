/* 会员卡 + 有效期双模式 + 编辑 + 推送 的端到端回归。
   跑法：先 npm run dev（或 next start），再 node scripts/e2e-member.js [baseUrl] */
const BASE = process.argv[2] || 'http://localhost:3000'
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
    get cookie() { return cookie },
    async req(path, opts = {}) {
      const res = await fetch(BASE + path, {
        ...opts,
        headers: {
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...(opts.headers || {})
        },
        redirect: 'manual'
      })
      const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : []
      for (const c of setCookie) {
        const pair = c.split(';')[0]
        if (pair.startsWith('honeybake_token=') && !pair.endsWith('=')) cookie = pair
      }
      let data = null
      try { data = await res.json() } catch { /* 非 JSON */ }
      return { status: res.status, ok: res.ok, data }
    }
  }
}

const daysFrom = (d, n) => Math.round((new Date(d).getTime() - Date.now()) / 86400000)

async function main() {
  // ---- 准备账号 ----
  const stamp = Date.now()
  const userEmail = `e2e_user_${stamp}@test.com`
  const userPass = 'Test123456'

  const admin = makeClient()
  const loginRes = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!loginRes.ok) {
    console.log('无法登录管理员账号(admin@honeybake.com/admin123)，先跑一次 /api/seed 或改脚本里的口令')
    process.exit(1)
  }

  const userClient = makeClient()
  const reg = await userClient.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, name: 'E2E会员测试', password: userPass })
  })
  ok('注册测试用户', reg.ok, JSON.stringify(reg.data))
  if (!reg.ok) process.exit(1)
  const userId = reg.data.user.id

  // 会员卡以手机号为凭证：买卡前必须先绑定手机号（本轮新增的约束）。
  // 号码带上 stamp，避免多次运行的账号互相占用。
  const testPhone = '137' + String(stamp).slice(-8)
  const bindPhone = await userClient.req('/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ phone: testPhone })
  })
  ok('购买会员卡前绑定手机号', bindPhone.ok, JSON.stringify(bindPhone.data))
  if (!bindPhone.ok) process.exit(1)

  console.log('\n== 1. 优惠券：双模式创建 + 校验 ==')
  const fixed = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E固定券', type: 'reduce', value: 15, minAmount: 100, stock: 0,
      perUserLimit: 2, stackable: true, validMode: 'fixed',
      startTime: '2026-01-01T00:00', endTime: '2030-12-31T23:59'
    })
  })
  ok('创建固定日期券', fixed.ok && fixed.data.coupon?.validMode === 'fixed', JSON.stringify(fixed.data))

  const rel = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E领取后7天券', type: 'discount', value: 9, minAmount: 0, stock: 0,
      perUserLimit: 1, stackable: false, validMode: 'relative', validDays: 7
    })
  })
  ok('创建领取后N天券', rel.ok && rel.data.coupon?.validMode === 'relative' && rel.data.coupon?.validDays === 7, JSON.stringify(rel.data))

  const badDays = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify({ name: 'x', type: 'reduce', value: 1, validMode: 'relative', validDays: 0 })
  })
  ok('relative 模式拒绝 validDays=0', badDays.status === 400, `status=${badDays.status}`)

  const badOrder = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify({
      name: 'x', type: 'reduce', value: 1, validMode: 'fixed',
      startTime: '2030-01-02T00:00', endTime: '2030-01-01T00:00'
    })
  })
  ok('拒绝开始晚于结束', badOrder.status === 400, `status=${badOrder.status}`)

  const badDiscount = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify({ name: 'x', type: 'discount', value: 12, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: '2030-01-01T00:00' })
  })
  ok('拒绝 12 折', badDiscount.status === 400, `status=${badDiscount.status}`)

  console.log('\n== 2. 优惠券：编辑 ==')
  const fixedId = fixed.data.coupon.id
  const put = await admin.req('/api/coupons', {
    method: 'PUT',
    body: JSON.stringify({
      id: fixedId, name: 'E2E固定券(已改)', type: 'reduce', value: 20, minAmount: 100, stock: 0,
      perUserLimit: 2, stackable: true, validMode: 'fixed',
      startTime: '2026-01-01T00:00', endTime: '2030-12-31T23:59'
    })
  })
  ok('PUT 修改额度与名称', put.ok && put.data.coupon.value === 20 && put.data.coupon.name === 'E2E固定券(已改)', JSON.stringify(put.data))

  const putBad = await admin.req('/api/coupons', {
    method: 'PUT',
    body: JSON.stringify({ id: fixedId, name: 'x', type: 'reduce', value: -1, validMode: 'fixed', startTime: '2026-01-01T00:00', endTime: '2030-01-01T00:00' })
  })
  ok('PUT 同样拦截非法额度', putBad.status === 400, `status=${putBad.status}`)

  const getOne = await admin.req(`/api/coupons?id=${fixedId}`)
  ok('GET ?id= 返回单张券', getOne.ok && getOne.data.coupon?.id === fixedId, JSON.stringify(getOne.data))

  console.log('\n== 3. 领取：relative 写 expireTime ==')
  const claim = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: rel.data.coupon.id }) })
  ok('领取领取后7天券', claim.ok && claim.data.success, JSON.stringify(claim.data))

  const ucRel = await prisma.userCoupon.findFirst({ where: { userId, couponId: rel.data.coupon.id } })
  const relDays = ucRel?.expireTime ? (new Date(ucRel.expireTime).getTime() - new Date(ucRel.claimTime).getTime()) / 86400000 : -1
  ok('expireTime = 领取时刻 + 7 天', Math.abs(relDays - 7) < 0.01, `实际 ${relDays} 天`)
  ok('source 记为 claim', ucRel?.source === 'claim', `source=${ucRel?.source}`)

  // 固定券也领一张，用于下单
  await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: fixedId }) })
  const ucFixed = await prisma.userCoupon.findFirst({ where: { userId, couponId: fixedId, status: 'active' } })
  ok('固定券领取成功且带 expireTime', !!ucFixed && !!ucFixed.expireTime, JSON.stringify(ucFixed))

  console.log('\n== 4. 会员卡：套餐 → 下单 → 确认收款 ==')
  const planRes = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E月卡', price: 29, days: 30, sort: 1 })
  })
  ok('创建套餐', planRes.ok, JSON.stringify(planRes.data))
  const plan = planRes.data.plan

  const plansPublic = await userClient.req('/api/membership/plans')
  ok('用户端能看到在售套餐', plansPublic.ok && plansPublic.data.plans.some(p => p.id === plan.id))

  const buy = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id }) })
  ok('用户创建购买单', buy.ok && buy.data.order?.status === 'pending', JSON.stringify(buy.data))
  const moId = buy.data.order.id

  const buyAgain = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id }) })
  ok('重复下单复用同一张待付款单', buyAgain.data.order?.id === moId)

  const confirm = await admin.req(`/api/membership/orders/${moId}`, {
    method: 'PUT',
    body: JSON.stringify({ id: moId, action: 'confirm' })
  })
  ok('管理员确认收款', confirm.ok && confirm.data.order?.status === 'paid', JSON.stringify(confirm.data))

  const afterFirst = await prisma.user.findUnique({ where: { id: userId } })
  const firstDays = daysFrom(afterFirst.memberExpire, 0)
  ok('会员到期 ≈ 30 天后', Math.abs(firstDays - 30) <= 1, `实际 ${firstDays} 天`)

  const noti = await prisma.notification.findFirst({ where: { userId, type: 'member' } })
  ok('开通时写入站内消息', !!noti, JSON.stringify(noti))

  // 续费叠加
  const buy2 = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id }) })
  await admin.req(`/api/membership/orders/${buy2.data.order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ id: buy2.data.order.id, action: 'confirm' })
  })
  const afterSecond = await prisma.user.findUnique({ where: { id: userId } })
  const secondDays = daysFrom(afterSecond.memberExpire, 0)
  ok('续费叠加到 ≈60 天（不是覆盖成 30）', Math.abs(secondDays - 60) <= 1, `实际 ${secondDays} 天`)

  const dupConfirm = await admin.req(`/api/membership/orders/${moId}`, {
    method: 'PUT',
    body: JSON.stringify({ id: moId, action: 'confirm' })
  })
  ok('重复确认同一单被拒', dupConfirm.status === 400, `status=${dupConfirm.status}`)

  console.log('\n== 5. 会员折扣接入下单 ==')
  const setRate = await admin.req('/api/settings', { method: 'PUT', body: JSON.stringify({ memberDiscount: 0.95 }) })
  ok('设置会员 95 折', setRate.ok, JSON.stringify(setRate.data))

  const badRate = await admin.req('/api/settings', { method: 'PUT', body: JSON.stringify({ memberDiscount: 1.2 }) })
  ok('拒绝 >1 的折扣率', badRate.status === 400, `status=${badRate.status}`)

  // 造 200 元订单 + 满100减20 券。
  // OrderItem.productId 有外键指向 Product，必须用真实商品 id
  const realProduct = await prisma.product.findFirst({ select: { id: true, name: true } })
  const items = [{ productId: realProduct.id, name: realProduct.name, price: 200, quantity: 1, unit: '份' }]
  const orderRes = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items, userCouponIds: [ucFixed.id], address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  const o = orderRes.data.order
  ok('下单成功', orderRes.ok && !!o, JSON.stringify(orderRes.data))
  if (o) {
    ok('商品金额 200', o.itemsAmount === 200, `itemsAmount=${o.itemsAmount}`)
    ok('优惠券 -20', o.couponDiscount === 20, `couponDiscount=${o.couponDiscount}`)
    ok('会员折扣 9.00（200-20=180 的 5%）', Math.abs(o.memberDiscount - 9) < 0.01, `memberDiscount=${o.memberDiscount}`)
    ok('实付 171.00（180-9，满68免运费）', Math.abs(o.totalAmount - 171) < 0.01, `totalAmount=${o.totalAmount}`)
  }

  const burned = await prisma.userCoupon.findUnique({ where: { id: ucFixed.id } })
  ok('券被核销', burned.status === 'used', `status=${burned.status}`)

  // 非会员无折扣
  const buyer2 = makeClient()
  const email2 = `e2e_nomember_${stamp}@test.com`
  await buyer2.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: email2, name: '非会员', password: userPass }) })
  const order2 = await buyer2.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items, address: { name: 'T', phone: '13800000001', detail: '测试地址' } })
  })
  ok('非会员下单无会员折扣', order2.ok && order2.data.order.memberDiscount === 0, JSON.stringify(order2.data.order?.memberDiscount))
  ok('非会员实付 200', Math.abs(order2.data.order.totalAmount - 200) < 0.01, `total=${order2.data.order?.totalAmount}`)

  console.log('\n== 6. 推送优惠券给会员 ==')
  const pushPreview = await admin.req(`/api/coupons/${rel.data.coupon.id}/push`)
  ok('推送预览返回会员数', pushPreview.ok && pushPreview.data.memberCount >= 1, JSON.stringify(pushPreview.data))

  const memberCount = pushPreview.data.memberCount
  const beforePush = await prisma.userCoupon.count({ where: { couponId: rel.data.coupon.id, source: 'push' } })

  const push = await admin.req(`/api/coupons/${rel.data.coupon.id}/push`, { method: 'POST' })
  ok('推送成功', push.ok && push.data.sent === memberCount, JSON.stringify(push.data))

  const afterPush = await prisma.userCoupon.count({ where: { couponId: rel.data.coupon.id, source: 'push' } })
  ok('每人券包各多一张 push 券', afterPush - beforePush === memberCount, `${beforePush} → ${afterPush}, 会员 ${memberCount}`)

  const mineNow = await prisma.userCoupon.count({ where: { userId, couponId: rel.data.coupon.id } })
  ok('已持有该券仍再收到一张（不去重）', mineNow === 2, `持有 ${mineNow} 张`)

  const pushNoti = await prisma.notification.count({ where: { userId, type: 'coupon', read: false } })
  ok('有一条未读券通知', pushNoti >= 1, `count=${pushNoti}`)

  // 再推一次，确认还是照发
  await admin.req(`/api/coupons/${rel.data.coupon.id}/push`, { method: 'POST' })
  const mineTwice = await prisma.userCoupon.count({ where: { userId, couponId: rel.data.coupon.id } })
  ok('重复推送再次到账', mineTwice === 3, `持有 ${mineTwice} 张`)

  const notiList = await userClient.req('/api/notifications')
  ok('消息中心接口返回列表与未读数', notiList.ok && notiList.data.notifications.length > 0 && notiList.data.unreadCount > 0, JSON.stringify({ n: notiList.data.notifications?.length, unread: notiList.data.unreadCount }))

  const markAll = await userClient.req('/api/notifications', { method: 'PUT', body: JSON.stringify({ all: true }) })
  ok('全部已读', markAll.ok && markAll.data.unreadCount === 0, JSON.stringify(markAll.data))

  console.log('\n== 7. 回归：删除回收 / 限领 / 叠加 / 事务 ==')
  const claimCount = await prisma.userCoupon.count({ where: { couponId: rel.data.coupon.id } })
  const del = await admin.req('/api/coupons', { method: 'DELETE', body: JSON.stringify({ id: rel.data.coupon.id }) })
  ok('删除券返回 removedClaims', del.ok && del.data.success && del.data.removedClaims === claimCount, JSON.stringify(del.data))
  const left = await prisma.userCoupon.count({ where: { couponId: rel.data.coupon.id } })
  ok('已领记录被一并回收', left === 0, `剩 ${left}`)

  await admin.req('/api/membership/plans', { method: 'DELETE', body: JSON.stringify({ id: plan.id }) })
  const planGone = await prisma.membershipPlan.findUnique({ where: { id: plan.id } })
  ok('有购买记录的套餐拒绝删除', !!planGone)

  // 清理测试数据（只删本次新建的账号，不动真实数据）
  const testUsers = await prisma.user.findMany({
    where: { email: { in: [userEmail, email2] } },
    select: { id: true }
  })
  const testIds = testUsers.map(u => u.id)
  if (testIds.length) {
    // 顺序不能反：Order → OrderItem/Address 都是外键，User 又指向 Order
    const orders = await prisma.order.findMany({ where: { userId: { in: testIds } }, select: { id: true } })
    const orderIds = orders.map(o => o.id)
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.address.deleteMany({ where: { userId: { in: testIds } } })
    await prisma.userCoupon.deleteMany({ where: { userId: { in: testIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: testIds } } })
    await prisma.membershipOrder.deleteMany({ where: { userId: { in: testIds } } })
    await prisma.user.deleteMany({ where: { id: { in: testIds } } })
  }
  await prisma.coupon.deleteMany({ where: { id: fixedId } })
  // 套餐要等购买单删完才能删（有这个约束在上面被验证过）
  await prisma.membershipPlan.deleteMany({ where: { id: plan.id } })
  // 折扣率是全局设置，测完恢复成「不打折」，别把开发库改成 95 折
  await prisma.shopSetting.updateMany({ where: { id: 'default' }, data: { memberDiscount: 1 } })
  console.log('\n（已清理本次测试产生的用户/订单/券/套餐，会员折扣已还原）')

  console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => {
  console.error('脚本异常:', e)
  await prisma.$disconnect()
  process.exit(1)
})
