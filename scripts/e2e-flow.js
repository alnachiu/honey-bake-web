/* 本轮八项需求里「流程类」改动的端到端回归：运费取最高、管理员禁下单、
   消费者声明付款 → 店主收到待办 → 店主确认 → 消费者收到结果、两个导出。
   跑法：先 npm run dev（或 next start），再 node scripts/e2e-flow.js [baseUrl] */
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
      try { data = await res.json() } catch { /* 非 JSON（导出是 CSV） */ }
      return { status: res.status, ok: res.ok, data, res }
    },
    // 导出接口返回 CSV，要走文本而不是 JSON
    async reqText(path) {
      const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {} })
      return { status: res.status, text: await res.text() }
    }
  }
}

/** 从通知里找标题包含某关键词的一条 */
const findNotice = (notices, keyword) => (notices || []).find(n => (n.title || '').includes(keyword))

async function main() {
  const stamp = Date.now()
  const admin = makeClient()
  const loginRes = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!loginRes.ok) {
    console.log('无法登录管理员账号(admin@honeybake.com/admin123)，先跑一次 /api/seed 或改脚本里的口令')
    process.exit(1)
  }

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@honeybake.com' } })
  const createdProductIds = []
  const createdUserIds = []
  const createdPlanIds = []

  const makeUser = async (label) => {
    const email = `e2e_flow_${label}_${stamp}@test.com`
    const c = makeClient()
    const reg = await c.req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: `E2E流程${label}`, password: 'Test123456' })
    })
    if (!reg.ok) { ok(`注册用户 ${label}`, false, JSON.stringify(reg.data)); return null }
    const phone = '138' + String(stamp).slice(-8)
    await c.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone }) })
    createdUserIds.push(reg.data.user.id)
    return { client: c, id: reg.data.user.id, email, phone }
  }

  const makeProduct = async (name, price, deliveryFee) => {
    const res = await admin.req('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name, price: String(price), originalPrice: '0', deliveryFee: String(deliveryFee),
        category: '曲奇', unit: '份', stock: '99', images: ['/placeholder.jpg'],
        detailImages: [], tags: [], status: 'on'
      })
    })
    if (!res.ok) { ok(`创建商品 ${name}`, false, JSON.stringify(res.data)); return null }
    createdProductIds.push(res.data.product.id)
    return res.data.product
  }

  const user = await makeUser('a')
  if (!user) process.exit(1)
  const other = await makeUser('b')
  if (!other) process.exit(1)

  const addr = await user.client.req('/api/addresses', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E收货人', phone: user.phone, region: '', detail: '测试地址1号', isDefault: true })
  })
  if (!addr.ok) { ok('创建收货地址', false, JSON.stringify(addr.data)); process.exit(1) }

  // ---------- 1. 管理员禁下单 ----------
  console.log('\n== 1. 管理员不能下单 ==')
  const adminOrder = await admin.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: 'whatever', name: 'x', price: 1, quantity: 1 }], addressId: addr.data.address.id })
  })
  ok('管理员走 /api/orders 被 403', adminOrder.status === 403, `status=${adminOrder.status}`)

  const adminMember = await admin.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: 'whatever' }) })
  ok('管理员走 /api/membership/orders 被 403', adminMember.status === 403, `status=${adminMember.status}`)

  // 游客单按手机号匹配账号，管理员手机号是一条绕过路径，必须一起堵
  const adminGuest = await admin.req('/api/orders/guest', {
    method: 'POST',
    body: JSON.stringify({
      name: adminUser.name, phone: adminUser.phone || '13900000000',
      address: '测试地址', items: [{ id: 'whatever', name: 'x', price: 1, quantity: 1 }]
    })
  })
  ok('管理员手机号走游客单也被挡', adminGuest.status === 403 || adminGuest.status === 400, `status=${adminGuest.status}`)

  // ---------- 2. 运费：整单取最高、不乘数量 ----------
  console.log('\n== 2. 运费 = 各商品最高值（不叠加、不乘数量）==')
  const cookie = await makeProduct('E2E饼干', 10, 5)
  const cake = await makeProduct('E2E蛋糕', 20, 8)
  const free = await makeProduct('E2E免运费品', 5, 0)

  const orderPayload = (items) => ({
    items: items.map(({ p, qty }) => ({ productId: p.id, name: p.name, image: '', price: p.price, quantity: qty, unit: '份' })),
    addressId: addr.data.address.id
  })

  const o1 = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload([{ p: cookie, qty: 2 }, { p: cake, qty: 1 }]))
  })
  ok('饼干5元×2 + 蛋糕8元×1 → 整单运费 8', o1.ok && o1.data.order.deliveryFee === 8, `fee=${o1.data.order?.deliveryFee}`)
  ok('实付 = 10×2 + 20 + 8 = 48', o1.ok && Math.abs(o1.data.order.totalAmount - 48) < 0.01, `total=${o1.data.order?.totalAmount}`)

  const o2 = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload([{ p: cookie, qty: 1 }, { p: free, qty: 3 }]))
  })
  ok('含免运费商品时仍取最高的 5', o2.ok && o2.data.order.deliveryFee === 5, `fee=${o2.data.order?.deliveryFee}`)

  const o3 = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload([{ p: free, qty: 2 }]))
  })
  ok('全部商品运费为 0 → 整单免运费', o3.ok && o3.data.order.deliveryFee === 0, `fee=${o3.data.order?.deliveryFee}`)

  // 服务端不采信前端传的运费：改贵了也不影响实收
  const o4 = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: cookie.id, name: cookie.name, image: '', price: cookie.price, quantity: 1, unit: '份' }],
      addressId: addr.data.address.id,
      deliveryFee: 999
    })
  })
  ok('前端传的运费被忽略（仍按库里 5）', o4.ok && o4.data.order.deliveryFee === 5, `fee=${o4.data.order?.deliveryFee}`)

  const badProduct = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: 'not-exist-id', name: 'x', image: '', price: 1, quantity: 1, unit: '份' }], addressId: addr.data.address.id })
  })
  ok('不存在的商品被 400 拦下（不再靠外键 500）', badProduct.status === 400, `status=${badProduct.status}`)

  // ---------- 3. 消费者声明付款 → 店主收到待办 ----------
  console.log('\n== 3. 「已扫码支付」通知店主 ==')
  const orderId = o1.data.order.id
  const notify = await user.client.req(`/api/orders/${orderId}/pay-notify`, { method: 'POST' })
  ok('声明已付款成功', notify.ok && notify.data.notified >= 1, JSON.stringify(notify.data))

  let adminNotices = await admin.req('/api/notifications')
  const payNotice = findNotice(adminNotices.data.notifications, '已扫码支付')
  ok('店主收到付款通知', !!payNotice, JSON.stringify(adminNotices.data.notifications?.map(n => n.title)))
  ok('通知跳转到该订单', payNotice?.link === `/admin/orders?orderId=${orderId}`, `link=${payNotice?.link}`)
  ok('订单记下 payClaimedAt', !!(await prisma.order.findUnique({ where: { id: orderId } })).payClaimedAt)

  const notifyAgain = await user.client.req(`/api/orders/${orderId}/pay-notify`, { method: 'POST' })
  ok('重复点击不重复发通知', notifyAgain.ok && notifyAgain.data.alreadyNotified === true, JSON.stringify(notifyAgain.data))
  const dupCount = await prisma.notification.count({ where: { userId: adminUser.id, link: `/admin/orders?orderId=${orderId}` } })
  ok('店主侧只留一条该单的通知', dupCount === 1, `count=${dupCount}`)

  const otherNotify = await other.client.req(`/api/orders/${orderId}/pay-notify`, { method: 'POST' })
  ok('别人的单声明不了', otherNotify.status === 403 || otherNotify.status === 404, `status=${otherNotify.status}`)

  // ---------- 4. 店主改状态 → 消费者收到通知 ----------
  console.log('\n== 4. 店主改状态同步给消费者 ==')
  const userNoticesBefore = await user.client.req('/api/notifications')
  const beforeCount = (userNoticesBefore.data.notifications || []).length

  const confirm = await admin.req(`/api/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'paid' })
  })
  ok('店主确认收款成功', confirm.ok, JSON.stringify(confirm.data))

  const userNotices = await user.client.req('/api/notifications')
  const list = userNotices.data.notifications || []
  ok('消费者收到新的状态通知', list.length > beforeCount, `${beforeCount} → ${list.length}`)
  const statusNotice = findNotice(list, '订单状态更新')
  ok('通知写明 待付款 → 待制作', !!statusNotice?.content?.includes('待付款') && statusNotice.content.includes('待制作'), `content=${statusNotice?.content}`)
  ok('通知跳转到订单详情', statusNotice?.link === `/orders/${orderId}`, `link=${statusNotice?.link}`)

  // 店主重复点同一个状态不刷屏
  const beforeDup = (await user.client.req('/api/notifications')).data.notifications.length
  await admin.req(`/api/orders/${orderId}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) })
  const afterDup = (await user.client.req('/api/notifications')).data.notifications.length
  ok('状态没变则不重复通知', afterDup === beforeDup, `${beforeDup} → ${afterDup}`)

  // ---------- 5. 会员卡闭环 ----------
  console.log('\n== 5. 会员卡：声明付款 → 店主确认 → 开通 ==')
  const plan = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E流程月卡${stamp}`, price: 29, days: 30, sort: 1 })
  })
  ok('创建套餐', plan.ok, JSON.stringify(plan.data))
  createdPlanIds.push(plan.data.plan.id)

  const buy = await user.client.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan.data.plan.id }) })
  ok('用户创建购买单', buy.ok && buy.data.order.status === 'pending', JSON.stringify(buy.data))
  const moId = buy.data.order.id

  const claim = await user.client.req(`/api/membership/orders/${moId}/notify`, { method: 'POST' })
  ok('用户点「我已付款」成功', claim.ok && claim.data.notified >= 1, JSON.stringify(claim.data))

  adminNotices = await admin.req('/api/notifications')
  const memberNotice = findNotice(adminNotices.data.notifications, '会员卡')
  ok('店主收到会员卡付款通知', !!memberNotice, JSON.stringify(adminNotices.data.notifications?.slice(0, 5).map(n => n.title)))
  ok('通知跳转到该会员卡单', memberNotice?.link === `/admin/membership?orderId=${moId}`, `link=${memberNotice?.link}`)

  const claimAgain = await user.client.req(`/api/membership/orders/${moId}/notify`, { method: 'POST' })
  ok('重复声明不重复通知', claimAgain.ok && claimAgain.data.alreadyNotified === true, JSON.stringify(claimAgain.data))

  const memberBefore = await user.client.req('/api/membership/orders')
  ok('确认前还不是会员', !memberBefore.data.memberExpire, `memberExpire=${memberBefore.data.memberExpire}`)

  const deal = await admin.req(`/api/membership/orders/${moId}`, { method: 'PUT', body: JSON.stringify({ id: moId, action: 'confirm' }) })
  ok('店主确认收款', deal.ok, JSON.stringify(deal.data))

  const memberAfter = await user.client.req('/api/membership/orders')
  ok('确认后立即成为会员', !!memberAfter.data.memberExpire, `memberExpire=${memberAfter.data.memberExpire}`)
  const days = Math.round((new Date(memberAfter.data.memberExpire).getTime() - Date.now()) / 86400000)
  ok('会员期 ≈ 30 天', Math.abs(days - 30) <= 1, `days=${days}`)
  const opened = findNotice(memberAfter.data.orders ? (await user.client.req('/api/notifications')).data.notifications : [], '会员已开通')
  ok('用户收到开通通知', !!opened, `title=${opened?.title}`)

  // 会员下单带折扣 + wasMember 快照
  const memberOrder = await user.client.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload([{ p: cake, qty: 1 }]))
  })
  const dbOrder = await prisma.order.findUnique({ where: { id: memberOrder.data.order.id } })
  ok('下单时写下 wasMember 快照', dbOrder.wasMember === true, `wasMember=${dbOrder.wasMember}`)

  const nonMemberOrder = await prisma.order.findUnique({ where: { id: orderId } })
  ok('下单当时不是会员的记为 false', nonMemberOrder.wasMember === false, `wasMember=${nonMemberOrder.wasMember}`)

  // ---------- 6. 两个独立导出 ----------
  console.log('\n== 6. 导出 ==')
  const orderCsv = await admin.reqText('/api/orders/export')
  const header = (orderCsv.text.split('\n')[0] || '').replace(/^﻿/, '')
  ok('订单 CSV 含「是否会员」列', header.includes('是否会员'), `header=${header}`)
  ok('订单 CSV 的运费列已改名', header.includes('运费') && !header.includes('配送费'), `header=${header}`)
  const row = orderCsv.text.split('\n').find(l => l.includes(nonMemberOrder.orderNo.slice(-8)))
  ok('历史单（非会员）导出为「否」', !!row && row.includes('"否"'), `row=${row?.slice(0, 200)}`)
  const memberRow = orderCsv.text.split('\n').find(l => l.includes(dbOrder.orderNo.slice(-8)))
  ok('会员单导出为「是」', !!memberRow && memberRow.includes('"是"'), `row=${memberRow?.slice(0, 200)}`)

  const memberCsv = await admin.reqText('/api/membership/orders/export')
  ok('会员卡导出有表头', memberCsv.status === 200 && memberCsv.text.includes('会员卡单号'), `status=${memberCsv.status}`)
  ok('会员卡导出含本次购买单', memberCsv.text.includes(String(moId).slice(-8)) || memberCsv.text.includes(plan.data.plan.name), `has plan=${memberCsv.text.includes(plan.data.plan.name)}`)

  const notAdmin = await user.client.reqText('/api/orders/export')
  ok('非管理员导出被拒', notAdmin.status === 403, `status=${notAdmin.status}`)

  // ---------- 清理 ----------
  console.log('\n（清理本次测试产生的商品/账号/套餐与订单）')
  // OrderItem 的外键没有配级联，必须先删子表再删订单，否则 P2003
  const myOrderIds = (await prisma.order.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } })).map(o => o.id)
  await prisma.orderItem.deleteMany({ where: { orderId: { in: myOrderIds } } })
  await prisma.order.deleteMany({ where: { id: { in: myOrderIds } } })
  await prisma.membershipOrder.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.address.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.notification.deleteMany({ where: { userId: adminUser.id, OR: [
    { link: { contains: `${orderId}` } },
    { link: { contains: `${moId}` } }
  ] } })
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } })
  await prisma.membershipPlan.deleteMany({ where: { id: { in: createdPlanIds } } })
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })

  console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
