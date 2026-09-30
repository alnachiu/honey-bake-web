/* 第三批安全加固与新功能的回归：
   手机号登录越权 / 无密码账号 / 管理员密码协助 / 通知与聊天删除的越权 /
   地址越权 / 订单收货快照 / 种子接口已删除 */
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
    get cookie() { return cookie },
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

const stamp = Date.now()
const newPhone = () => '13' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
const created = { users: [], addresses: [], conversations: [] }

async function registerConsumer(email, name) {
  const c = makeClient()
  const res = await c.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password: 'Test123456' })
  })
  if (!res.ok) throw new Error(`注册失败 ${email}: ${JSON.stringify(res.data)}`)
  return c
}

async function main() {
  // ============================================================
  console.log('\n== 1. 手机号登录不能拿到管理员身份（P0 越权）==')
  const adminRow = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!adminRow) { console.log('库里没有管理员账号，跳过'); process.exit(1) }

  if (adminRow.phone) {
    const usersWithPhone = await prisma.user.count({ where: { phone: adminRow.phone } })
    const anon = makeClient()
    const res = await anon.req('/api/auth/phone-login', {
      method: 'POST', body: JSON.stringify({ phone: adminRow.phone })
    })
    ok('管理员手机号不能免密登录', res.status === 400, `status=${res.status} data=${JSON.stringify(res.data)}`)
    ok('响应里没有下发任何登录态', !res.data?.user, JSON.stringify(res.data))
    ok('没有为此偷偷建一个同号的消费者账号',
      (await prisma.user.count({ where: { phone: adminRow.phone } })) === usersWithPhone,
      `before=${usersWithPhone} after=${await prisma.user.count({ where: { phone: adminRow.phone } })}`)
    ok('该手机号名下仍然只有管理员一个账号',
      (await prisma.user.count({ where: { phone: adminRow.phone, role: 'user' } })) === 0)
  } else {
    console.log('  ℹ️  管理员没有手机号，该项在本机不适用（这正是修复后的预期状态）')
  }

  // 直接给管理员塞一个手机号，验证防护确实生效（而不是靠「恰好没手机号」）
  const probePhone = newPhone()
  await prisma.user.update({ where: { id: adminRow.id }, data: { phone: probePhone } })
  const probe = makeClient()
  const probeRes = await probe.req('/api/auth/phone-login', {
    method: 'POST', body: JSON.stringify({ phone: probePhone })
  })
  ok('给管理员配上手机号后依然拿不到登录态', probeRes.status === 400, `status=${probeRes.status}`)
  ok('这个手机号也没有被占成一个消费者账号',
    (await prisma.user.count({ where: { phone: probePhone, role: 'user' } })) === 0)
  await prisma.user.update({ where: { id: adminRow.id }, data: { phone: adminRow.phone } })

  // ============================================================
  console.log('\n== 2. 无密码账号：邮箱登录被拒 / 手机号可登录 / 可自行设密码 ==')
  const p2 = newPhone()
  const guest = makeClient()
  const createRes = await guest.req('/api/auth/phone-login', {
    method: 'POST', body: JSON.stringify({ phone: p2, name: '免密测试' })
  })
  ok('手机号首次登录直接建号并登录', createRes.ok && createRes.data.isNew === true, JSON.stringify(createRes.data))
  const u2 = await prisma.user.findFirst({ where: { phone: p2 } })
  created.users.push(u2.id)
  ok('自动建号时不再生成随机密码（password 为 null）', u2.password === null, `password=${u2.password}`)

  const emailLogin = makeClient()
  const el = await emailLogin.req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: u2.email, password: 'whatever123' })
  })
  ok('无密码账号走邮箱登录被拒（不是 500）', el.status === 401, `status=${el.status}`)
  ok('且提示改用手机号登录', /手机号/.test(el.data?.error || ''), JSON.stringify(el.data))

  const meAfter = await guest.req('/api/users/me')
  ok('/api/users/me 下发 hasPassword=false', meAfter.ok && meAfter.data.user?.hasPassword === false,
    JSON.stringify(meAfter.data?.user?.hasPassword))
  ok('/api/users/me 不返回密码哈希', !('password' in (meAfter.data?.user || {})), JSON.stringify(Object.keys(meAfter.data?.user || {})))

  // 不带原密码直接设置密码 —— 清除密码之后顾客自救的唯一路径
  const setPwd = await guest.req('/api/auth/change-password', {
    method: 'POST', body: JSON.stringify({ oldPassword: '', newPassword: 'BrandNew123' })
  })
  ok('无密码账号可以不填原密码直接设置密码', setPwd.ok, `status=${setPwd.status} ${JSON.stringify(setPwd.data)}`)

  const meAfter2 = await guest.req('/api/users/me')
  ok('设置后 hasPassword 变 true', meAfter2.data?.user?.hasPassword === true)

  const emailLogin2 = makeClient()
  const el2 = await emailLogin2.req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: u2.email, password: 'BrandNew123' })
  })
  ok('设完密码后可以用邮箱+新密码登录', el2.ok, `status=${el2.status} ${JSON.stringify(el2.data)}`)

  const wrongOld = await guest.req('/api/auth/change-password', {
    method: 'POST', body: JSON.stringify({ oldPassword: 'totally-wrong', newPassword: 'Another123' })
  })
  ok('有密码之后就必须校验原密码了', wrongOld.status === 400, `status=${wrongOld.status}`)

  // ============================================================
  console.log('\n== 3. /api/admin/users 的鉴权 ==')
  const adminClient = makeClient()
  const adminLogin = await adminClient.req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!adminLogin.ok) { console.log('管理员登录失败，后续跳过'); }

  const consumerClient = await registerConsumer(`e2e_sec_${stamp}@test.com`, '安全测试员')
  const consumerRow = await prisma.user.findUnique({ where: { email: `e2e_sec_${stamp}@test.com` } })
  created.users.push(consumerRow.id)

  const cGet = await consumerClient.req('/api/admin/users')
  ok('消费者访问 → 403（不是 500）', cGet.status === 403, `status=${cGet.status}`)
  const cPost = await consumerClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: consumerRow.id, action: 'clear-password' })
  })
  ok('消费者调用清除密码 → 403', cPost.status === 403, `status=${cPost.status}`)

  const anonGet = await makeClient().req('/api/admin/users')
  ok('未登录访问 → 401', anonGet.status === 401, `status=${anonGet.status}`)

  const aGet = await adminClient.req(`/api/admin/users?phone=${encodeURIComponent(consumerRow.phone || '')}`)
  ok('管理员搜索 → 200', aGet.ok, `status=${aGet.status}`)
  const found = (aGet.data?.users || []).find(u => u.id === consumerRow.id)
  ok('搜索结果里含有目标用户', !!found, JSON.stringify(aGet.data?.users?.map(u => u.id)))
  ok('返回体只给 hasPassword，不含哈希',
    found && 'hasPassword' in found && !('password' in found),
    found ? JSON.stringify(Object.keys(found)) : 'not found')

  // 再做一次「另一个管理员」的护栏
  const admin2 = await prisma.user.create({
    data: {
      email: `e2e_admin2_${stamp}@test.com`, name: '第二管理员',
      password: '$2a$12$abcdefghijklmnopqrstuv', phone: '', role: 'admin'
    }
  })
  created.users.push(admin2.id)
  const clearAdmin = await adminClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: admin2.id, action: 'clear-password' })
  })
  ok('不能清除另一个管理员的密码 → 403', clearAdmin.status === 403, `status=${clearAdmin.status}`)
  ok('那个管理员的密码没被动',
    (await prisma.user.findUnique({ where: { id: admin2.id } })).password !== null)

  const badAction = await adminClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: consumerRow.id, action: 'reset-password' })
  })
  ok('不支持的操作被拒 → 400', badAction.status === 400, `status=${badAction.status}`)

  // ============================================================
  console.log('\n== 4. 清除密码：数据保留 + 顾客仍能进得来 ==')
  const target = await prisma.user.findFirst({ where: { id: consumerRow.id } })
  // 给他造一条订单和一个通知，用来验证「清密码不动数据」
  const prod = await prisma.product.findFirst()
  const addr = await prisma.address.create({
    data: { userId: target.id, name: '测试收货人', phone: '13700000001', region: '广东省 深圳市', detail: '科技园1号', isDefault: true }
  })
  created.addresses.push(addr.id)
  const orderNo = `E2ESEC${stamp}`
  const preOrder = await prisma.order.create({
    data: {
      orderNo, userId: target.id, addressId: addr.id, totalAmount: 10, itemsAmount: 10,
      receiverName: '测试收货人', receiverPhone: '13700000001', receiverRegion: '广东省 深圳市', receiverDetail: '科技园1号',
      items: { create: [{ productId: prod.id, name: prod.name, price: 10, quantity: 1 }] }
    }
  })
  const noticesBefore = await prisma.notification.count({ where: { userId: target.id } })

  // 没有手机号的账号不允许清除密码——否则会把人彻底锁死
  const noPhoneUser = await prisma.user.create({
    data: { email: `e2e_nophone_${stamp}@test.com`, name: '无手机号', password: await require('bcryptjs').hash('x123456', 12), phone: '', role: 'user' }
  })
  created.users.push(noPhoneUser.id)
  const blocked = await adminClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: noPhoneUser.id, action: 'clear-password' })
  })
  ok('没有手机号的账号拒绝清除密码 → 400', blocked.status === 400, `status=${blocked.status}`)
  ok('被拒绝时密码保持原样',
    (await prisma.user.findUnique({ where: { id: noPhoneUser.id } })).password !== null)

  await prisma.user.update({ where: { id: target.id }, data: { phone: newPhone() } })
  const targetPhone = (await prisma.user.findUnique({ where: { id: target.id } })).phone
  const clearRes = await adminClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: target.id, action: 'clear-password' })
  })
  ok('管理员清除密码成功', clearRes.ok, `status=${clearRes.status} ${JSON.stringify(clearRes.data)}`)
  ok('password 已被置空', (await prisma.user.findUnique({ where: { id: target.id } })).password === null)
  ok('订单数据保留', (await prisma.order.count({ where: { userId: target.id } })) === 1)
  ok('订单号与快照未变',
    (await prisma.order.findUnique({ where: { id: preOrder.id } })).receiverDetail === '科技园1号')
  ok('顾客收到一条「密码已重置」通知',
    (await prisma.notification.count({ where: { userId: target.id } })) === noticesBefore + 1)

  const again = await adminClient.req('/api/admin/users', {
    method: 'POST', body: JSON.stringify({ userId: target.id, action: 'clear-password' })
  })
  ok('对已免密的账号重复清除不报错', again.ok && again.data.alreadyClear === true, JSON.stringify(again.data))

  const relogin = makeClient()
  const rl = await relogin.req('/api/auth/phone-login', { method: 'POST', body: JSON.stringify({ phone: targetPhone }) })
  ok('顾客可以用手机号重新登录', rl.ok && rl.data.isNew === false, JSON.stringify(rl.data))

  // ============================================================
  console.log('\n== 5. 通知删除的越权 ==')
  const victim = await prisma.user.create({
    data: { email: `e2e_victim_${stamp}@test.com`, name: '受害者', password: null, phone: '', role: 'user' }
  })
  created.users.push(victim.id)
  const victimNotice = await prisma.notification.create({
    data: { userId: victim.id, title: '不该被删掉的通知', content: '机密', type: 'system' }
  })

  const delOther = await consumerClient.req('/api/notifications', {
    method: 'DELETE', body: JSON.stringify({ ids: [victimNotice.id] })
  })
  ok('拿别人的通知 id 删除 → 无效（不报 500）', delOther.status === 200 && delOther.data.deleted === 0,
    `status=${delOther.status} ${JSON.stringify(delOther.data)}`)
  ok('对方那条通知还在',
    (await prisma.notification.count({ where: { id: victimNotice.id } })) === 1)

  const ownNotice = await prisma.notification.create({
    data: { userId: consumerRow.id, title: '我自己的通知', content: 'xx', type: 'system' }
  })
  const delOwn = await consumerClient.req('/api/notifications', {
    method: 'DELETE', body: JSON.stringify({ ids: [ownNotice.id] })
  })
  ok('删自己的通知 → 成功', delOwn.ok && delOwn.data.deleted === 1, JSON.stringify(delOwn.data))
  ok('确实删掉了', (await prisma.notification.count({ where: { id: ownNotice.id } })) === 0)

  const delEmpty = await consumerClient.req('/api/notifications', {
    method: 'DELETE', body: JSON.stringify({ ids: [] })
  })
  ok('不传 id 也不传 all → 400', delEmpty.status === 400, `status=${delEmpty.status}`)

  // 清空只能清自己的
  await prisma.notification.create({ data: { userId: consumerRow.id, title: 'A', type: 'system' } })
  const delAllRes = await consumerClient.req('/api/notifications', {
    method: 'DELETE', body: JSON.stringify({ all: true })
  })
  ok('全部清空返回成功', delAllRes.ok, JSON.stringify(delAllRes.data))
  ok('自己的清空了', (await prisma.notification.count({ where: { userId: consumerRow.id } })) === 0)
  ok('别人的一条没动', (await prisma.notification.count({ where: { id: victimNotice.id } })) === 1)

  // ============================================================
  console.log('\n== 6. 聊天按边清除 ==')
  const chatUser = await prisma.user.create({
    data: { email: `e2e_chatdel_${stamp}@test.com`, name: '聊天删除测试', password: null, phone: '', role: 'user' }
  })
  created.users.push(chatUser.id)
  const chatClient = makeClient()
  // 借用手机号登录拿到这个账号的会话
  await prisma.user.update({ where: { id: chatUser.id }, data: { phone: newPhone() } })
  const cp = (await prisma.user.findUnique({ where: { id: chatUser.id } })).phone
  await chatClient.req('/api/auth/phone-login', { method: 'POST', body: JSON.stringify({ phone: cp }) })
  created.conversations.push(chatUser.id)

  await chatClient.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '第一条' }) })
  await chatClient.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '第二条' }) })
  const adminListBefore = await adminClient.req('/api/chat')
  ok('店主能看到这个会话', !!adminListBefore.data.conversations.find(c => c.userId === chatUser.id))

  const clearByAdmin = await adminClient.req('/api/chat', {
    method: 'DELETE', body: JSON.stringify({ userId: chatUser.id })
  })
  ok('店主清空该会话', clearByAdmin.ok && clearByAdmin.data.count >= 2, JSON.stringify(clearByAdmin.data))

  const adminListAfter = await adminClient.req('/api/chat')
  ok('店主这边会话消失',
    !adminListAfter.data.conversations.find(c => c.userId === chatUser.id),
    JSON.stringify(adminListAfter.data.conversations?.map(c => c.userId)))

  const userStill = await chatClient.req('/api/chat')
  ok('顾客这边一条都没少（只从店主那边消失）',
    userStill.data.messages.length === 2, `len=${userStill.data.messages?.length}`)

  await chatClient.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '第三条' }) })
  const adminListAgain = await adminClient.req('/api/chat')
  const convAgain = adminListAgain.data.conversations.find(c => c.userId === chatUser.id)
  ok('顾客再发新消息后会话重新出现', !!convAgain)
  ok('店主只看到清空之后的新消息', convAgain && convAgain.lastMessage === '第三条', convAgain?.lastMessage)
  const adminThread = await adminClient.req(`/api/chat?userId=${chatUser.id}`)
  ok('店主点进去也只看得到新消息', adminThread.data.messages.length === 1,
    `len=${adminThread.data.messages?.length}`)

  const clearByUser = await chatClient.req('/api/chat', { method: 'DELETE', body: JSON.stringify({}) })
  ok('顾客清空自己的会话', clearByUser.ok, JSON.stringify(clearByUser.data))
  const userAfter = await chatClient.req('/api/chat')
  ok('顾客这边看不到了', userAfter.data.messages.length === 0, `len=${userAfter.data.messages?.length}`)
  const adminStill = await adminClient.req(`/api/chat?userId=${chatUser.id}`)
  ok('店主那边仍然看得到全部', adminStill.data.messages.length >= 1, `len=${adminStill.data.messages?.length}`)

  const adminNoTarget = await adminClient.req('/api/chat', { method: 'DELETE', body: JSON.stringify({}) })
  ok('店主不指定顾客就清空 → 400（防止一把清光）', adminNoTarget.status === 400, `status=${adminNoTarget.status}`)

  // ============================================================
  console.log('\n== 7. 地址越权与订单收货快照 ==')
  const victimAddr = await prisma.address.create({
    data: { userId: victim.id, name: '受害者的地址', phone: '13700000009', region: '北京市', detail: '别人家1号', isDefault: true }
  })
  created.addresses.push(victimAddr.id)

  const steal = await consumerClient.req('/api/addresses', {
    method: 'PUT', body: JSON.stringify({ id: victimAddr.id, detail: '被改了' })
  })
  ok('改别人的地址 → 404', steal.status === 404, `status=${steal.status}`)
  ok('对方的地址内容没变',
    (await prisma.address.findUnique({ where: { id: victimAddr.id } })).detail === '别人家1号')

  const steal2 = await consumerClient.req('/api/addresses', {
    method: 'PUT', body: JSON.stringify({ id: victimAddr.id, userId: consumerRow.id, detail: '过户给我' })
  })
  ok('不能通过传 userId 把别人的地址过户过来', steal2.status === 404, `status=${steal2.status}`)
  ok('归属仍然是原主',
    (await prisma.address.findUnique({ where: { id: victimAddr.id } })).userId === victim.id)

  const delOtherAddr = await consumerClient.req('/api/addresses', {
    method: 'DELETE', body: JSON.stringify({ id: victimAddr.id })
  })
  ok('删别人的地址 → 404', delOtherAddr.status === 404, `status=${delOtherAddr.status}`)
  ok('对方的地址还在', (await prisma.address.count({ where: { id: victimAddr.id } })) === 1)

  // 用自己的地址下单 → 之后再改地址，订单应保留下单当时的信息
  const myAddr = await prisma.address.create({
    data: { userId: consumerRow.id, name: '下单时的收货人', phone: '13700000002', region: '上海市', detail: '下单时的地址', isDefault: true }
  })
  created.addresses.push(myAddr.id)
  const orderRes = await consumerClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
      addressId: myAddr.id
    })
  })
  ok('用自己的地址下单成功', orderRes.ok, `status=${orderRes.status} ${JSON.stringify(orderRes.data)}`)
  const newOrder = orderRes.data?.order
  ok('订单上写入了收货快照',
    newOrder && newOrder.receiverName === '下单时的收货人' && newOrder.receiverDetail === '下单时的地址',
    JSON.stringify({ n: newOrder?.receiverName, d: newOrder?.receiverDetail }))

  await consumerClient.req('/api/addresses', {
    method: 'PUT', body: JSON.stringify({ id: myAddr.id, name: '改过的收货人', detail: '改过的地址' })
  })
  const orderAfter = await consumerClient.req(`/api/orders/${newOrder.id}`)
  ok('改了地址之后，历史订单仍显示下单当时的信息',
    orderAfter.data?.order?.receiverName === '下单时的收货人' &&
    orderAfter.data?.order?.receiverDetail === '下单时的地址',
    JSON.stringify({ n: orderAfter.data?.order?.receiverName, d: orderAfter.data?.order?.receiverDetail }))

  // 拿别人的 addressId 下单：不能借此读到别人的地址
  const stealOrder = await consumerClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ productId: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
      addressId: victimAddr.id
    })
  })
  ok('用别人的 addressId 下单被拒', !stealOrder.ok, `status=${stealOrder.status}`)

  // 删掉默认地址后，服务端要把剩下最新的一条顶上来
  const a1 = await prisma.address.create({
    data: { userId: consumerRow.id, name: 'A', phone: '13700000003', detail: 'A路', isDefault: false }
  })
  await consumerClient.req('/api/addresses', { method: 'PUT', body: JSON.stringify({ id: a1.id, isDefault: true }) })
  created.addresses.push(a1.id)
  await consumerClient.req('/api/addresses', { method: 'DELETE', body: JSON.stringify({ id: a1.id }) })
  ok('删掉默认地址后自动有新的默认地址',
    (await prisma.address.count({ where: { userId: consumerRow.id, isDefault: true } })) === 1,
    `count=${await prisma.address.count({ where: { userId: consumerRow.id, isDefault: true } })}`)

  // ============================================================
  console.log('\n== 8. 种子接口已删除 ==')
  const seedRes = await makeClient().req('/api/seed')
  ok('/api/seed 返回 404', seedRes.status === 404, `status=${seedRes.status}`)

  // ============================================================
  console.log('\n== 清理测试数据 ==')
  // OrderItem 没有配 onDelete: Cascade，必须先把子行删掉再删订单，否则外键拦下
  const staleOrders = await prisma.order.findMany({
    where: { userId: { in: created.users } },
    select: { id: true }
  })
  await prisma.orderItem.deleteMany({ where: { orderId: { in: staleOrders.map(o => o.id) } } })
  await prisma.order.deleteMany({ where: { id: { in: staleOrders.map(o => o.id) } } })
  await prisma.chatConversation.deleteMany({ where: { userId: { in: created.users } } })
  await prisma.notification.deleteMany({ where: { userId: { in: created.users } } })
  await prisma.userCoupon.deleteMany({ where: { userId: { in: created.users } } })
  await prisma.address.deleteMany({ where: { userId: { in: created.users } } })
  await prisma.user.deleteMany({ where: { id: { in: created.users } } })
  console.log(`  已清理 ${created.users.length} 个测试账号及其数据`)

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
