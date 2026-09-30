/* 站内聊天（「联系小二」）：
   双向收发 / 未读数 / 标记已读 / 7 天闲置清除 / 越权与未登录 */
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

const DAY = 24 * 60 * 60 * 1000

async function main() {
  const stamp = Date.now()
  const emailA = `e2e_chat_a_${stamp}@test.com`
  const emailB = `e2e_chat_b_${stamp}@test.com`

  const admin = makeClient()
  const login = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!login.ok) { console.log('管理员登录失败'); process.exit(1) }

  const a = makeClient()
  await a.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: emailA, name: '聊天测试A', password: 'Test123456' }) })
  const b = makeClient()
  await b.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: emailB, name: '聊天测试B', password: 'Test123456' }) })

  const userA = await prisma.user.findUnique({ where: { email: emailA } })
  const userB = await prisma.user.findUnique({ where: { email: emailB } })
  if (!userA || !userB) { console.log('测试用户创建失败'); process.exit(1) }

  // 每个用例独立清理，避免上一次跑残留的会话影响未读数
  await prisma.chatConversation.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })
  await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })

  console.log('\n== 1. 消费者发消息 → 店主收到 ==')
  const send1 = await a.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '你好，曲奇什么时候发货？' }) })
  ok('消费者发送成功', send1.ok && send1.data.message?.senderRole === 'user', JSON.stringify(send1.data))
  ok('会话已建立', !!(await prisma.chatConversation.findUnique({ where: { userId: userA.id } })))

  const adminList = await admin.req('/api/chat')
  ok('店主能看到会话列表', adminList.ok && Array.isArray(adminList.data.conversations), `status=${adminList.status}`)
  const convA = adminList.data.conversations.find(c => c.userId === userA.id)
  ok('列表里有这位顾客', !!convA, JSON.stringify(adminList.data.conversations?.map(c => c.userId)))
  ok('未读数为 1', convA && convA.unread === 1, `unread=${convA && convA.unread}`)
  ok('列表带出最后一条内容', convA && convA.lastMessage.includes('曲奇'))

  const adminNotices = await prisma.notification.count({ where: { userId: { not: userA.id }, type: 'chat', title: '💬 顾客发来消息' } })
  ok('店主收到聊天通知', adminNotices > 0, `count=${adminNotices}`)

  console.log('\n== 2. 标记已读 ==')
  const mark = await admin.req('/api/chat', { method: 'PUT', body: JSON.stringify({ userId: userA.id }) })
  ok('标记已读返回条数', mark.ok && mark.data.count === 1, JSON.stringify(mark.data))
  const afterRead = await admin.req('/api/chat')
  const convA2 = afterRead.data.conversations.find(c => c.userId === userA.id)
  ok('未读数归零', convA2 && convA2.unread === 0, `unread=${convA2 && convA2.unread}`)

  console.log('\n== 3. 店主回复 → 消费者收到 ==')
  const reply = await admin.req('/api/chat', { method: 'POST', body: JSON.stringify({ userId: userA.id, body: '今天下午就发，注意查收～' }) })
  ok('店主回复成功', reply.ok && reply.data.message?.senderRole === 'admin', JSON.stringify(reply.data))
  ok('消费者收到回复通知', (await prisma.notification.count({ where: { userId: userA.id, type: 'chat' } })) > 0)

  const aThread = await a.req('/api/chat')
  ok('消费者看到两条消息', aThread.ok && aThread.data.messages.length === 2, `len=${aThread.data.messages?.length}`)
  ok('消息按时间正序', aThread.data.messages[0]?.senderRole === 'user' && aThread.data.messages[1]?.senderRole === 'admin')
  ok('带上 7 天保留期与清除时刻', aThread.data.retentionDays === 7 && !!aThread.data.expireAt, JSON.stringify({ d: aThread.data.retentionDays, e: aThread.data.expireAt }))

  // 清除时刻必须落在「最后一条消息 + 7 天」附近（给 5 分钟余量）
  const expected = new Date(aThread.data.messages[1].createdAt).getTime() + 7 * DAY
  ok('清除时刻 = 最后一条 + 7 天', Math.abs(new Date(aThread.data.expireAt).getTime() - expected) < 5 * 60 * 1000,
    `expireAt=${aThread.data.expireAt} expected≈${new Date(expected).toISOString()}`)

  const aRead = await a.req('/api/chat', { method: 'PUT', body: JSON.stringify({}) })
  ok('消费者标记已读', aRead.ok && aRead.data.count === 1, JSON.stringify(aRead.data))

  console.log('\n== 4. 越权与未登录 ==')
  const anon = makeClient()
  const anonGet = await anon.req('/api/chat')
  ok('未登录访问被拒', !anonGet.ok, `status=${anonGet.status}`)
  const anonPost = await anon.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '匿名' }) })
  ok('未登录发送被拒', !anonPost.ok, `status=${anonPost.status}`)

  // 消费者在 POST 里塞别人的 userId：消息必须落在自己会话，不能串到别人那儿
  await a.req('/api/chat', { method: 'POST', body: JSON.stringify({ userId: userB.id, body: '越权投递测试' }) })
  ok('无法把消息塞进别人的会话', !(await prisma.chatConversation.findUnique({ where: { userId: userB.id } })))

  const adminSelf = await admin.req('/api/chat', { method: 'POST', body: JSON.stringify({ userId: (await prisma.user.findFirst({ where: { role: 'admin' } })).id, body: '自说自话' }) })
  ok('店长不能给自己发消息', adminSelf.status === 400, `status=${adminSelf.status}`)

  const adminNoTarget = await admin.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '没指定收件人' }) })
  ok('店长未指定顾客时被拒', adminNoTarget.status === 400, `status=${adminNoTarget.status}`)

  console.log('\n== 5. 内容校验 ==')
  const empty = await a.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '   ' }) })
  ok('空消息被拒', empty.status === 400, `status=${empty.status}`)
  const long = await a.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: 'x'.repeat(900) }) })
  ok('超长消息被截断到 500', long.ok && long.data.message.body.length === 500, `len=${long.data.message?.body?.length}`)

  console.log('\n== 6. 闲置 7 天后清除 ==')
  const convBefore = await prisma.chatConversation.findUnique({ where: { userId: userA.id } })
  const msgBefore = await prisma.chatMessage.count({ where: { conversationId: convBefore.id } })
  ok('清除前消息存在', msgBefore > 0, `msgs=${msgBefore}`)

  // 把最后一条消息时间倒回 8 天（惰性清理的判断基准就是它）
  await prisma.chatConversation.update({
    where: { userId: userA.id },
    data: { lastMessageAt: new Date(Date.now() - 8 * DAY) }
  })

  const afterPurge = await a.req('/api/chat')
  ok('会话被清掉（消费者侧读不到）', afterPurge.ok && afterPurge.data.messages.length === 0 && !afterPurge.data.conversation,
    JSON.stringify({ c: afterPurge.data.conversation, n: afterPurge.data.messages?.length }))
  ok('会话行已删除', !(await prisma.chatConversation.findUnique({ where: { userId: userA.id } })))
  ok('消息随会话级联删除', (await prisma.chatMessage.count({ where: { conversationId: convBefore.id } })) === 0)

  console.log('\n== 7. 活跃会话不被误清 ==')
  await a.req('/api/chat', { method: 'POST', body: JSON.stringify({ body: '还在吗' }) })
  // 店主刚刚访问过一次（上面几次 GET），再拉一次确认新会话活着
  const alive = await admin.req('/api/chat')
  ok('新会话仍在', !!alive.data.conversations.find(c => c.userId === userA.id))
  // 另一位的会话（从未有过消息）本就不该存在
  ok('无关用户未被牵连', !(await prisma.chatConversation.findUnique({ where: { userId: userB.id } })))

  // 清理本次测试数据
  await prisma.chatConversation.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })
  await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
