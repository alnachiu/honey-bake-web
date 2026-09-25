/* 管理员手机端订单管理的端到端回归：全部订单可见、时间/状态筛选、分页、
   日期边界（时区陷阱）、消费者侧不受影响、店主改状态仍会通知买家。
   跑法：先 npm run dev（或 next start），再 node scripts/e2e-admin-orders.js [baseUrl] */
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

const pad2 = n => String(n).padStart(2, '0')
const dayStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

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

  const createdUserIds = []
  const createdProductIds = []
  const createdOrderIds = []

  const makeUser = async label => {
    const email = `e2e_admin_${label}_${stamp}@test.com`
    const c = makeClient()
    const reg = await c.req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name: `E2E管理${label}`, password: 'Test123456' })
    })
    if (!reg.ok) { ok(`注册用户 ${label}`, false, JSON.stringify(reg.data)); return null }
    createdUserIds.push(reg.data.user.id)
    return { client: c, id: reg.data.user.id, email }
  }

  const buyer = await makeUser('buyer')
  const other = await makeUser('other')
  if (!buyer || !other) process.exit(1)

  const addr = await buyer.client.req('/api/addresses', {
    method: 'POST',
    body: JSON.stringify({ name: '管理测试收货人', phone: '13800001111', region: '', detail: '测试地址2号', isDefault: true })
  })
  if (!addr.ok) { ok('创建收货地址', false, JSON.stringify(addr.data)); process.exit(1) }

  const prod = await admin.req('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E管理商品${stamp}`, price: '20', originalPrice: '0', deliveryFee: '0',
      category: '曲奇', unit: '份', stock: '99', images: ['/placeholder.jpg'],
      detailImages: [], tags: [], status: 'on'
    })
  })
  if (!prod.ok) { ok('创建商品', false, JSON.stringify(prod.data)); process.exit(1) }
  createdProductIds.push(prod.data.product.id)
  const product = prod.data.product

  const placeOrder = async () => {
    const res = await buyer.client.req('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ productId: product.id, name: product.name, image: '', price: product.price, quantity: 1, unit: '份' }],
        addressId: addr.data.address.id
      })
    })
    if (!res.ok) { ok('下单', false, JSON.stringify(res.data)); process.exit(1) }
    createdOrderIds.push(res.data.order.id)
    return res.data.order
  }

  const orderA = await placeOrder()
  const orderB = await placeOrder()

  // 把其中一单的 createdAt 挪到「今天 03:00」——这正是 UTC 零点写法会漏掉的那批单
  const today = new Date()
  const at = (h, m = 0, s = 0, ms = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, s, ms)
  const TODAY = dayStr(today)
  const YESTERDAY = dayStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  await prisma.order.update({ where: { id: orderA.id }, data: { createdAt: at(3) } })

  // ---------- 1. 管理员能看到全部订单 ----------
  console.log('\n== 1. 管理员的订单管理能看到别人的单 ==')
  const all = await admin.req('/api/orders?pageSize=200')
  ok('管理员拿到全部订单', all.ok && Array.isArray(all.data.orders), `status=${all.status}`)
  ok('含消费者 A 的订单', (all.data.orders || []).some(o => o.id === orderA.id))
  ok('返回 total', typeof all.data.total === 'number' && all.data.total >= 2, `total=${all.data.total}`)
  const adminRow = (all.data.orders || []).find(o => o.id === orderA.id)
  ok('管理员拿得到下单账号', !!adminRow?.user?.id, JSON.stringify(adminRow?.user))

  // ---------- 2. 消费者侧一点没变 ----------
  console.log('\n== 2. 消费者侧不受影响 ==')
  const mine = await buyer.client.req('/api/orders')
  ok('消费者仍拿到 { orders }', mine.ok && Array.isArray(mine.data.orders), `status=${mine.status}`)
  ok('消费者只看到自己的单', (mine.data.orders || []).every(o => o.userId === buyer.id))
  ok('消费者响应里不带下单账号（形状与改造前一致）', !('user' in (mine.data.orders || [])[0]))
  const otherMine = await other.client.req('/api/orders')
  ok('另一个消费者看不到 A 的单', (otherMine.data.orders || []).every(o => o.id !== orderA.id))
  // 日期是店主专用参数，消费者带上也不该生效（更不该借它查到别人的单）
  const mineWithDates = await buyer.client.req(`/api/orders?startDate=2020-01-01&endDate=2020-01-31`)
  ok('消费者传日期参数被忽略，仍看到自己的单',
    (mineWithDates.data.orders || []).some(o => o.id === orderA.id), `n=${mineWithDates.data.orders?.length}`)

  // ---------- 3. 时间筛选 ----------
  console.log('\n== 3. 时间筛选（含跨时区边界）==')
  const todayRes = await admin.req(`/api/orders?startDate=${TODAY}&endDate=${TODAY}&pageSize=200`)
  const todayIds = (todayRes.data.orders || []).map(o => o.id)
  ok('今天 03:00 的单落在「今天」区间（UTC 零点写法会漏掉它）', todayIds.includes(orderA.id))

  // 同一区间的总数与直接用本地日界算出来的一致（独立复算，确认边界不是 UTC 日界）
  const expectedToday = await prisma.order.count({
    where: { createdAt: { gte: at(0), lte: at(23, 59, 59, 999) } }
  })
  ok('total 与本地日界的独立复算一致', todayRes.data.total === expectedToday,
    `api=${todayRes.data.total} db=${expectedToday}`)

  // 当天 23:59 的单也必须落在今天（end 若取当天 00:00 会漏）
  await prisma.order.update({ where: { id: orderB.id }, data: { createdAt: at(23, 59) } })
  const todayRes2 = await admin.req(`/api/orders?startDate=${TODAY}&endDate=${TODAY}&pageSize=200`)
  ok('23:59 的单仍在「今天」区间（end 取的是当天末刻）',
    (todayRes2.data.orders || []).some(o => o.id === orderB.id))

  const yRes = await admin.req(`/api/orders?startDate=${YESTERDAY}&endDate=${YESTERDAY}&pageSize=200`)
  ok('「昨天」区间不含今天的单', !(yRes.data.orders || []).some(o => o.id === orderA.id))
  ok('「昨天」区间的 total 里没有今天的单', yRes.data.total < expectedToday, `yTotal=${yRes.data.total}`)

  const pastRes = await admin.req('/api/orders?startDate=2020-01-01&endDate=2020-01-31&pageSize=200')
  ok('2020 年的区间查不到本次的单', !(pastRes.data.orders || []).some(o => o.id === orderA.id))

  const swapRes = await admin.req(`/api/orders?startDate=${TODAY}&endDate=${YESTERDAY}&pageSize=200`)
  ok('起止填反了自动交换，不返回空列表', (swapRes.data.orders || []).some(o => o.id === orderA.id))

  const dirtyRes = await admin.req('/api/orders?startDate=abc&endDate=2026-13-99&pageSize=200')
  ok('脏日期参数不报错（忽略无效的一端）', dirtyRes.status === 200 && (dirtyRes.data.orders || []).length > 0,
    `status=${dirtyRes.status}`)
  const halfRes = await admin.req(`/api/orders?startDate=${TODAY}&endDate=abc&pageSize=200`)
  ok('只有起始日期时按「从该日起」筛', halfRes.status === 200 && (halfRes.data.orders || []).some(o => o.id === orderA.id),
    `status=${halfRes.status}`)

  // ---------- 4. 状态筛选与分页 ----------
  console.log('\n== 4. 状态筛选 + 分页 ==')
  const p1 = await admin.req('/api/orders?page=1&pageSize=1')
  const p2 = await admin.req('/api/orders?page=2&pageSize=1')
  ok('pageSize 生效', (p1.data.orders || []).length === 1, `n=${p1.data.orders?.length}`)
  ok('page 翻页拿到不同的单', p1.data.orders[0].id !== p2.data.orders[0].id,
    `${p1.data.orders[0].id} vs ${p2.data.orders[0].id}`)
  ok('分页不影响 total', p1.data.total === p2.data.total && p1.data.total > 1, `total=${p1.data.total}`)
  const badPage = await admin.req('/api/orders?page=abc&pageSize=9999')
  ok('脏分页参数被夹回合法范围而不是 500', badPage.status === 200 && (badPage.data.orders || []).length <= 200,
    `status=${badPage.status} n=${badPage.data.orders?.length}`)
  const pendingRes = await admin.req('/api/orders?status=pending&pageSize=200')
  ok('按状态筛选：返回的每一条都是该状态',
    (pendingRes.data.orders || []).every(o => o.status === 'pending'))
  ok('状态筛选也带 total', typeof pendingRes.data.total === 'number')

  // ---------- 5. 店主在订单管理里改状态 ----------
  console.log('\n== 5. 店主改状态 + 通知买家 ==')
  const before = (await buyer.client.req('/api/notifications')).data.notifications.length
  const paid = await admin.req(`/api/orders/${orderA.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) })
  ok('店主把消费者的单改成待制作', paid.ok, JSON.stringify(paid.data))
  const afterDb = await prisma.order.findUnique({ where: { id: orderA.id } })
  ok('状态已落库', afterDb.status === 'paid' && !!afterDb.payTime, `status=${afterDb.status}`)
  const after = (await buyer.client.req('/api/notifications')).data.notifications
  ok('买家收到状态变更通知', after.length > before, `${before} → ${after.length}`)
  const notice = after.find(n => (n.title || '').includes('订单状态更新'))
  ok('通知文案写明 待付款 → 待制作', !!notice?.content?.includes('待制作'), `content=${notice?.content}`)

  const ship = await admin.req(`/api/orders/${orderA.id}`, {
    method: 'PUT', body: JSON.stringify({ status: 'delivering', trackingNo: `SF${stamp}` })
  })
  ok('发货并录入单号', ship.ok, JSON.stringify(ship.data))
  const shippedDb = await prisma.order.findUnique({ where: { id: orderA.id } })
  ok('单号已落库', shippedDb.trackingNo === `SF${stamp}`, `trackingNo=${shippedDb.trackingNo}`)

  const noChange = await admin.req(`/api/orders/${orderA.id}`, {
    method: 'PUT', body: JSON.stringify({ status: 'delivering', trackingNo: `SF${stamp}X` })
  })
  const buyerNotices = (await buyer.client.req('/api/notifications')).data.notifications
  ok('只改单号不重复通知买家', noChange.ok && buyerNotices.filter(n => (n.title || '').includes('订单状态更新')).length === 2,
    `n=${buyerNotices.filter(n => (n.title || '').includes('订单状态更新')).length}`)

  // ---------- 清理 ----------
  console.log('\n（清理本次测试产生的商品/账号与订单）')
  // OrderItem 的外键没有配级联，必须先删子表再删订单
  await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } })
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } })
  await prisma.address.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } })
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } })
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
