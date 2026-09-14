/* 手机号作为会员凭证 的端到端回归：
   买卡前强制绑定 / 号码唯一 / 公开查询接口不泄露 / 游客不打折 / 手机号登录后打折
   跑法：先 npm run dev（或 next start），再 node scripts/e2e-phone.js [baseUrl] */
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

// 注意别撞上 seed 里已有的号码：admin 是 13800138000、测试用户是 13900139000。
// 撞上会走成「该号已绑定其他账号」，第一轮就是这么误报的。
const MEMBER_PHONE = '13712341234'   // 会绑定并开通会员
const PLAIN_PHONE = '13787658765'    // 只绑定、不开会员
const daysFrom = (d, n) => Math.round((new Date(d).getTime() - Date.now()) / 86400000)

async function main() {
  const stamp = Date.now()
  const emailA = `e2e_phone_a_${stamp}@test.com`
  const emailB = `e2e_phone_b_${stamp}@test.com`
  const passwd = 'Test123456'

  const admin = makeClient()
  const login = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!login.ok) { console.log('管理员登录失败(admin@honeybake.com/admin123)'); process.exit(1) }

  // 前置检查：这两个号码必须没被任何账号占用，而且要在改任何全局设置之前查。
  // 撞号的话「绑定」那几步会走成「已绑定其他账号」，游客单还会把地址/订单挂到
  // 别人的账号上——第一轮就是撞上了 seed 里的 admin 号码（13800138000），
  // 把测试订单和地址写进了管理员账号。
  const clash = await prisma.user.findMany({
    where: { phone: { in: [MEMBER_PHONE, PLAIN_PHONE] } },
    select: { phone: true }
  })
  ok('测试号码未被现有账号占用', clash.length === 0, `已占用：${clash.map(u => u.phone).join(',')}，请换号后重跑`)
  if (clash.length) { await prisma.$disconnect(); process.exit(1) }

  // 会员折扣设成 95 折，最后要还原
  const rateRes = await admin.req('/api/settings', { method: 'PUT', body: JSON.stringify({ memberDiscount: 0.95 }) })
  if (!rateRes.ok) { console.log('设置会员折扣失败，先跑一次 /api/seed 或检查 /api/settings'); process.exit(1) }

  const planRes = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E手机号凭证月卡', price: 29, days: 30, sort: 1 })
  })
  ok('准备：创建套餐', planRes.ok, JSON.stringify(planRes.data))
  const plan = planRes.data.plan

  const A = makeClient()
  const regA = await A.req('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: emailA, name: '手机号凭证A', password: passwd })
  })
  ok('准备：邮箱注册账号A（无手机号）', regA.ok, JSON.stringify(regA.data))
  if (!regA.ok) process.exit(1)
  const userAId = regA.data.user.id

  const B = makeClient()
  await B.req('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: emailB, name: '手机号凭证B', password: passwd })
  })
  const userB = await prisma.user.findUnique({ where: { email: emailB } })
  const userBId = userB.id

  console.log('\n== 1. 没绑定手机号不能买会员卡 ==')
  const rowA = await prisma.user.findUnique({ where: { id: userAId } })
  ok('账号A的 phone 初始为空字符串', rowA.phone === '', `phone="${rowA.phone}"`)

  const buyNoPhone = await A.req('/api/membership/orders', {
    method: 'POST', body: JSON.stringify({ planId: plan.id })
  })
  ok('无手机号创建购买单被拒 400', buyNoPhone.status === 400, `status=${buyNoPhone.status} ${JSON.stringify(buyNoPhone.data)}`)
  ok('错误信息提示绑定手机号', /绑定手机号/.test(buyNoPhone.data?.error || ''), `error=${buyNoPhone.data?.error}`)

  const orphan = await prisma.membershipOrder.count({ where: { userId: userAId } })
  ok('库里没有产生购买单', orphan === 0, `count=${orphan}`)

  console.log('\n== 2. 绑定手机号 ==')
  const bad1 = await A.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: 'abc' }) })
  ok('非手机号被拒 400', bad1.status === 400, `status=${bad1.status}`)

  const bad2 = await A.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: '12345678901' }) })
  ok('1 开头但第二位非法被拒 400', bad2.status === 400, `status=${bad2.status}`)

  const bad3 = await A.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: '1380013800' }) })
  ok('位数不足被拒 400', bad3.status === 400, `status=${bad3.status}`)

  const bindA = await A.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: MEMBER_PHONE }) })
  ok('绑定合法手机号成功', bindA.ok && bindA.data.user?.phone === MEMBER_PHONE, JSON.stringify(bindA.data))
  const afterBind = await prisma.user.findUnique({ where: { id: userAId } })
  ok('手机号落到库里', afterBind.phone === MEMBER_PHONE, `phone=${afterBind.phone}`)

  console.log('\n== 3. 一个号码只能挂一个账号 ==')
  const bindB = await B.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: MEMBER_PHONE }) })
  ok('B 绑 A 已占用的号被拒 400', bindB.status === 400, `status=${bindB.status} ${JSON.stringify(bindB.data)}`)
  ok('提示去用手机号登录', /已绑定其他账号|手机号登录/.test(bindB.data?.error || ''), `error=${bindB.data?.error}`)

  const bindB2 = await B.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: PLAIN_PHONE }) })
  ok('B 绑另一个没被占用的号成功', bindB2.ok, JSON.stringify(bindB2.data))

  // 重复绑自己的号码不应被判成「他人的账号」
  const rebindA = await A.req('/api/users/me', { method: 'PUT', body: JSON.stringify({ phone: MEMBER_PHONE }) })
  ok('A 重绑自己的号码不算冲突', rebindA.ok, JSON.stringify(rebindA.data))

  console.log('\n== 4. 绑定后才能开卡 ==')
  const buyOk = await A.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id }) })
  ok('绑定后创建购买单成功', buyOk.ok && buyOk.data.order?.status === 'pending', JSON.stringify(buyOk.data))
  const moId = buyOk.data.order?.id

  const confirm = await admin.req(`/api/membership/orders/${moId}`, {
    method: 'PUT', body: JSON.stringify({ id: moId, action: 'confirm' })
  })
  ok('管理员确认收款', confirm.ok && confirm.data.order?.status === 'paid', JSON.stringify(confirm.data))

  const memberRow = await prisma.user.findUnique({ where: { id: userAId } })
  ok('会员期 ≈ 30 天', Math.abs(daysFrom(memberRow.memberExpire, 0) - 30) <= 1, `实际 ${daysFrom(memberRow.memberExpire, 0)} 天`)

  console.log('\n== 5. 按手机号查会员（公开接口）==')
  const hit = await A.req(`/api/membership/check?phone=${MEMBER_PHONE}`)
  ok('会员号 isMember=true', hit.ok && hit.data.isMember === true, JSON.stringify(hit.data))
  ok('会员号 discount=0.95', Math.abs((hit.data.discount ?? 0) - 0.95) < 1e-9, `discount=${hit.data.discount}`)

  const keys = Object.keys(hit.data || {}).sort()
  ok('只返回 isMember / discount 两个字段', keys.length === 2 && keys[0] === 'discount' && keys[1] === 'isMember', keys.join(','))
  ok('不泄露 name / memberExpire', !('name' in (hit.data || {})) && !('memberExpire' in (hit.data || {})), JSON.stringify(hit.data))

  const notMember = await A.req(`/api/membership/check?phone=${PLAIN_PHONE}`)
  ok('已绑号但非会员 → false', notMember.ok && notMember.data.isMember === false, JSON.stringify(notMember.data))

  const notExist = await A.req('/api/membership/check?phone=13600001111')
  ok('未注册的号 → false', notExist.ok && notExist.data.isMember === false, JSON.stringify(notExist.data))

  const badFormat = await A.req('/api/membership/check?phone=abc')
  ok('格式非法 → false（不查库）', badFormat.ok && badFormat.data.isMember === false, JSON.stringify(badFormat.data))

  const empty = await A.req('/api/membership/check')
  ok('不传参数 → false', empty.ok && empty.data.isMember === false, JSON.stringify(empty.data))

  // 直接造一份「同号多账号」的存量数据（绑定接口现在挡得住，只能从库里模拟），
  // 验证查询取的是该号码下最晚到期的会员卡
  await prisma.user.update({ where: { id: userBId }, data: { phone: MEMBER_PHONE } })
  const legacy = await A.req(`/api/membership/check?phone=${MEMBER_PHONE}`)
  ok('同号多账号时仍能识别出会员', legacy.data?.isMember === true, JSON.stringify(legacy.data))
  await prisma.user.update({ where: { id: userBId }, data: { phone: PLAIN_PHONE } })

  console.log('\n== 6. 游客填会员手机号不打折 ==')
  const realProduct = await prisma.product.findFirst({ select: { id: true, name: true } })
  const items = [{ productId: realProduct.id, name: realProduct.name, price: 200, quantity: 1, unit: '份' }]
  const guestItems = [{ id: realProduct.id, name: realProduct.name, price: 200, quantity: 1, unit: '份' }]

  const guest = makeClient()
  const guestOrder = await guest.req('/api/orders/guest', {
    method: 'POST',
    body: JSON.stringify({
      name: '游客会员号', phone: MEMBER_PHONE, address: '测试地址',
      items: guestItems
    })
  })
  ok('游客下单成功', guestOrder.ok && !!guestOrder.data.order, JSON.stringify(guestOrder.data))
  if (guestOrder.data.order) {
    const o = guestOrder.data.order
    ok('游客单 memberDiscount=0（须先登录）', o.memberDiscount === 0, `memberDiscount=${o.memberDiscount}`)
    ok('游客实付 = 原价 200（满68免运费）', Math.abs(o.totalAmount - 200) < 0.01, `total=${o.totalAmount}`)
  }

  const guestBad = await makeClient().req('/api/orders/guest', {
    method: 'POST',
    body: JSON.stringify({ name: '游客', phone: 'abc', address: '测试地址', items: guestItems })
  })
  ok('游客手机号格式非法被拒 400', guestBad.status === 400, `status=${guestBad.status}`)

  console.log('\n== 7. 手机号登录后本单享折扣 ==')
  const badLogin = await makeClient().req('/api/auth/phone-login', {
    method: 'POST', body: JSON.stringify({ phone: 'abc' })
  })
  ok('非法手机号登录被拒 400', badLogin.status === 400, `status=${badLogin.status}`)
  const junk = await prisma.user.count({ where: { phone: 'abc' } })
  ok('没有创建垃圾账号', junk === 0, `count=${junk}`)

  const member = makeClient()
  const memberLogin = await member.req('/api/auth/phone-login', {
    method: 'POST', body: JSON.stringify({ phone: MEMBER_PHONE })
  })
  ok('用会员手机号登录成功', memberLogin.ok && memberLogin.data.isNew === false, JSON.stringify(memberLogin.data))
  ok('登录返回里带 memberExpire', !!memberLogin.data.user?.memberExpire, JSON.stringify(memberLogin.data.user))

  const memberOrder = await member.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items, address: { name: 'T', phone: MEMBER_PHONE, detail: '测试地址' } })
  })
  ok('登录后下单成功', memberOrder.ok && !!memberOrder.data.order, JSON.stringify(memberOrder.data))
  if (memberOrder.data.order) {
    const o = memberOrder.data.order
    ok('会员折扣 = 200 的 5% = 10', Math.abs(o.memberDiscount - 10) < 0.01, `memberDiscount=${o.memberDiscount}`)
    ok('实付 190', Math.abs(o.totalAmount - 190) < 0.01, `total=${o.totalAmount}`)
  }

  // ---- 清理：只删本次新建的账号与套餐 ----
  const testIds = [userAId, userBId]
  const orders = await prisma.order.findMany({ where: { userId: { in: testIds } }, select: { id: true } })
  const orderIds = orders.map(o => o.id)
  // 顺序不能反：OrderItem/Address 都是外键，User 又指向 Order
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
  await prisma.address.deleteMany({ where: { userId: { in: testIds } } })
  await prisma.userCoupon.deleteMany({ where: { userId: { in: testIds } } })
  await prisma.notification.deleteMany({ where: { userId: { in: testIds } } })
  await prisma.membershipOrder.deleteMany({ where: { userId: { in: testIds } } })
  await prisma.user.deleteMany({ where: { id: { in: testIds } } })
  // 套餐要等购买单删完才能删
  await prisma.membershipPlan.deleteMany({ where: { id: plan.id } })
  // 折扣率是全局设置，测完恢复成「不打折」
  await prisma.shopSetting.updateMany({ where: { id: 'default' }, data: { memberDiscount: 1 } })
  console.log('\n（已清理本次测试账号/订单/套餐，会员折扣已还原）')

  console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => {
  console.error('脚本异常:', e)
  await prisma.$disconnect()
  process.exit(1)
})
