/* 管理员自主排序（商品 / 优惠券）的端到端回归。

   跑法：先 npm run dev（或 next start），再 node scripts/e2e-sort.js [baseUrl]

   本脚本会真的改动商品与优惠券的 sort 列，开头把两表的 sort（以及券的 visible）
   全量备份下来，结尾逐行还原，所以开发库不会留下被排过的痕迹；
   期间新建的测试商品也会删掉。 */
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

const state = {
  userId: '',
  createdProductIds: [],
  productSort: [],   // [{id, sort}]
  couponSort: [],    // [{id, sort}]
  couponVisible: []  // [{id, visible}]
}

/** 消费者视角的商品顺序（只含已上架商品，与后台列表同源） */
async function consumerProductIds(client) {
  const res = await client.req('/api/products?pageSize=100')
  return (res.data?.products || []).map(p => p.id)
}

async function adminCouponIds(client) {
  const res = await client.req('/api/coupons?all=true')
  return { ids: (res.data?.coupons || []).map(c => c.id), coupons: res.data?.coupons || [] }
}

/** 数据库里真实的 sort 值，用来确认「接口 200」不等于「真的落库了」 */
async function dbProductSort() {
  const rows = await prisma.product.findMany({ select: { id: true, sort: true } })
  return Object.fromEntries(rows.map(r => [r.id, r.sort]))
}
async function dbCouponSort() {
  const rows = await prisma.coupon.findMany({ select: { id: true, sort: true } })
  return Object.fromEntries(rows.map(r => [r.id, r.sort]))
}

async function main() {
  const stamp = Date.now()

  const admin = makeClient()
  const loginRes = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!loginRes.ok) {
    console.log('无法登录管理员账号(admin@honeybake.com/admin123)，请先跑 `npm run db:seed` 或改脚本里的口令')
    process.exit(1)
  }

  // 备份：sort 是会被本脚本真的改掉的用户数据，必须先存下来
  state.productSort = await prisma.product.findMany({ select: { id: true, sort: true } })
  state.couponSort = await prisma.coupon.findMany({ select: { id: true, sort: true } })
  state.couponVisible = await prisma.coupon.findMany({ select: { id: true, visible: true } })

  // 一个普通用户，用来验证非管理员拿不到重排权限
  const userClient = makeClient()
  const reg = await userClient.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `e2e_sort_${stamp}@test.com`, name: 'E2E排序测试', password: 'Test123456' })
  })
  ok('注册测试用户', reg.ok, JSON.stringify(reg.data))
  if (!reg.ok) process.exit(1)
  state.userId = reg.data.user.id

  const before = await consumerProductIds(admin)

  // ---------- 1. 权限 ----------
  console.log('\n【1】鉴权：只有管理员能重排')
  const noAuthProducts = await makeClient().req('/api/products/reorder', {
    method: 'PUT', body: JSON.stringify({ ids: before })
  })
  ok('未登录调商品重排 → 403', noAuthProducts.status === 403, `实际 ${noAuthProducts.status}`)

  const noAuthCoupons = await makeClient().req('/api/coupons/reorder', {
    method: 'PUT', body: JSON.stringify({ ids: [] })
  })
  ok('未登录调优惠券重排 → 403', noAuthCoupons.status === 403, `实际 ${noAuthCoupons.status}`)

  const asUserProducts = await userClient.req('/api/products/reorder', {
    method: 'PUT', body: JSON.stringify({ ids: [...before].reverse() })
  })
  ok('普通用户调商品重排 → 403', asUserProducts.status === 403, `实际 ${asUserProducts.status}`)

  const asUserCoupons = await userClient.req('/api/coupons/reorder', {
    method: 'PUT', body: JSON.stringify({ ids: [] })
  })
  ok('普通用户调优惠券重排 → 403', asUserCoupons.status === 403, `实际 ${asUserCoupons.status}`)

  const afterDenied = await consumerProductIds(admin)
  ok('被拒的请求没有改动任何顺序', JSON.stringify(afterDenied) === JSON.stringify(before))

  // ---------- 2. 入参校验 ----------
  console.log('\n【2】入参校验')
  for (const [label, body] of [
    ['缺 ids → 400', {}],
    ['ids 不是数组 → 400', { ids: 'abc' }],
    ['ids 是空数组 → 400', { ids: [] }],
    ['ids 重复 → 400', { ids: [before[0], before[0]] }]
  ]) {
    const r = await admin.req('/api/products/reorder', { method: 'PUT', body: JSON.stringify(body) })
    ok(label, r.status === 400, `实际 ${r.status}`)
  }

  // ---------- 3. 商品重排：消费者视角立即生效 ----------
  console.log('\n【3】商品重排')
  if (before.length < 2) {
    ok('商品数量足够跑重排（至少 2 件）', false, `只有 ${before.length} 件已上架商品`)
  } else if (before.length >= 100) {
    // 后台列表只取前 100 条，第 100 名之后的书 sort 会保持 0 而排到前面，这轮不覆盖该场景
    ok('商品数少于 100（本脚本不覆盖分页场景）', false, `实际 ${before.length} 件`)
  } else {
    const reversed = [...before].reverse()
    const r = await admin.req('/api/products/reorder', {
      method: 'PUT', body: JSON.stringify({ ids: reversed })
    })
    ok('重排接口返回 200', r.status === 200, JSON.stringify(r.data))
    ok('重排接口报告的更新条数 = 提交条数', r.data?.updated === reversed.length, `实际 ${r.data?.updated}`)

    const afterOrder = await consumerProductIds(admin)
    ok('消费者视角顺序 = 提交顺序', JSON.stringify(afterOrder) === JSON.stringify(reversed),
      `期望 ${reversed.join(',')} / 实际 ${afterOrder.join(',')}`)

    // 接口返回 200 也要回数据库核一遍，避免「响应对了、其实没写进去」
    const dbSort = await dbProductSort()
    const expectSort = Object.fromEntries(reversed.map((id, i) => [id, i + 1]))
    const sortMatches = reversed.every(id => dbSort[id] === expectSort[id])
    ok('数据库 sort 真的是 1..n', sortMatches,
      reversed.map(id => `${id}:${dbSort[id]}≠${expectSort[id]}`).slice(0, 3).join(' '))

    // ---------- 4. 不存在的 id ----------
    console.log('\n【4】提交里混入已删除的 id')
    const ghost = 'ghost-id-does-not-exist'
    const rGhost = await admin.req('/api/products/reorder', {
      method: 'PUT', body: JSON.stringify({ ids: [ghost, ...reversed] })
    })
    ok('混入不存在的 id 不报错（200）', rGhost.status === 200, JSON.stringify(rGhost.data))
    ok('只更新真实存在的那些', rGhost.data?.updated === reversed.length, `实际 ${rGhost.data?.updated}`)
    const afterGhost = await consumerProductIds(admin)
    ok('其余项顺序仍然正确', JSON.stringify(afterGhost) === JSON.stringify(reversed),
      afterGhost.join(','))

    // ---------- 5. 新品排最前 ----------
    console.log('\n【5】重排后新建商品 → 排在最前面')
    const created = await admin.req('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: `E2E排序新品_${stamp}`, price: '9.9', stock: '1', status: 'on' })
    })
    ok('新建商品成功', created.ok && !!created.data?.product?.id, JSON.stringify(created.data))
    if (created.data?.product?.id) {
      const newId = created.data.product.id
      state.createdProductIds.push(newId)
      ok('新品的 sort 是默认值 0', created.data.product.sort === 0, `实际 ${created.data.product.sort}`)

      const withNew = await consumerProductIds(admin)
      ok('新品排在第一位', withNew[0] === newId, `第一位是 ${withNew[0]}`)
      ok('原有顺序没有被新品挤乱',
        JSON.stringify(withNew.slice(1)) === JSON.stringify(reversed), withNew.join(','))

      const del = await admin.req(`/api/products/${newId}`, { method: 'DELETE' })
      ok('清理测试商品', del.ok, JSON.stringify(del.data))
      if (del.ok) state.createdProductIds = state.createdProductIds.filter(x => x !== newId)

      const afterDel = await consumerProductIds(admin)
      ok('删掉新品后顺序恢复', JSON.stringify(afterDel) === JSON.stringify(reversed), afterDel.join(','))
    }
  }

  // ---------- 6. 优惠券重排 ----------
  console.log('\n【6】优惠券重排')
  const { ids: couponIds, coupons: couponRows } = await adminCouponIds(admin)
  if (couponIds.length < 2) {
    ok('优惠券数量足够跑重排（至少 2 张）', false, `只有 ${couponIds.length} 张`)
  } else {
    const reversedCoupons = [...couponIds].reverse()
    const rc = await admin.req('/api/coupons/reorder', {
      method: 'PUT', body: JSON.stringify({ ids: reversedCoupons })
    })
    ok('优惠券重排接口返回 200', rc.status === 200, JSON.stringify(rc.data))
    ok('更新条数 = 提交条数', rc.data?.updated === reversedCoupons.length, `实际 ${rc.data?.updated}`)

    const afterCoupons = await adminCouponIds(admin)
    ok('后台列表顺序 = 提交顺序', JSON.stringify(afterCoupons.ids) === JSON.stringify(reversedCoupons),
      afterCoupons.ids.join(','))

    // 消费者领券中心只展示「生效中 + 未隐藏 + 在有效期内」的券，
    // 所以不能比全长，只能比它在消费者列表里的相对先后。
    const consumer = await admin.req('/api/coupons')
    const consumerIds = (consumer.data?.coupons || []).map(c => c.id)
    const pos = Object.fromEntries(reversedCoupons.map((id, i) => [id, i]))
    const monotonic = consumerIds.every((id, i) => i === 0 || pos[consumerIds[i - 1]] < pos[id])
    ok('消费者领券中心的相对顺序也跟着变', monotonic, consumerIds.join(','))

    // ---------- 7. 隐藏/显示开关不能打乱顺序 ----------
    // 优惠券的 PUT 是**全量覆盖**，这是本轮最容易翻车的地方：
    // 只要有人往 validateCouponInput 的返回里加上 sort，这个开关（它捕获的是重排前的旧值）
    // 就会把刚调好的顺序悄悄写回去。这条断言就是盯这个的。
    console.log('\n【7】重排后按「隐藏/显示」→ 顺序不能被打乱')
    const dbBefore = await dbCouponSort()
    let toggled = 0
    for (const c of couponRows) {
      // 等价于页面上的 handleToggleVisible：couponToForm(c) 再翻转 visible。
      // 券的 startTime/endTime 在库里本来就是 'YYYY-MM-DDTHH:mm' 字符串，原样回传即可。
      const r = await admin.req('/api/coupons', {
        method: 'PUT',
        body: JSON.stringify({ ...c, visible: !c.visible })
      })
      if (!r.ok) { ok(`切换券「${c.name}」显示状态`, false, JSON.stringify(r.data)); break }
      toggled++
    }
    ok(`切换了全部 ${couponRows.length} 张券的显示状态`, toggled === couponRows.length, `实际 ${toggled}`)

    const afterToggleOrder = await adminCouponIds(admin)
    ok('顺序没有被「隐藏/显示」打乱',
      JSON.stringify(afterToggleOrder.ids) === JSON.stringify(reversedCoupons),
      afterToggleOrder.ids.join(','))

    const dbAfter = await dbCouponSort()
    ok('数据库里的 sort 一个都没变',
      JSON.stringify(dbAfter) === JSON.stringify(dbBefore),
      Object.keys(dbAfter).filter(id => dbAfter[id] !== dbBefore[id]).join(','))

    // 顺带确认开关本身是有效的（别把「没生效」误当成「没打乱」）。
    // 逐张比对是否真的变成了反面——全部券的初始值可能相同，所以不能断言「有 true 也有 false」
    const flipped = afterToggleOrder.coupons.every(c => {
      const was = couponRows.find(x => x.id === c.id)?.visible
      return c.visible === !was
    })
    ok('显示状态确实被逐张翻转了', flipped,
      afterToggleOrder.coupons.map(c => c.visible).join(','))
  }
}

/** 把 sort / visible 逐行还原，并删掉测试期间新建的商品；再兜一次测试用户 */
async function cleanup() {
  for (const r of state.productSort) {
    await prisma.product.update({ where: { id: r.id }, data: { sort: r.sort } }).catch(() => {})
  }
  for (const r of state.couponSort) {
    await prisma.coupon.update({ where: { id: r.id }, data: { sort: r.sort } }).catch(() => {})
  }
  for (const r of state.couponVisible) {
    await prisma.coupon.update({ where: { id: r.id }, data: { visible: r.visible } }).catch(() => {})
  }
  if (state.createdProductIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: state.createdProductIds } } }).catch(() => {})
  }
  if (state.userId) {
    await prisma.notification.deleteMany({ where: { userId: state.userId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: state.userId } }).catch(() => {})
  }
  console.log('\n（商品/优惠券的 sort 与 visible 已逐行还原，测试用户与测试商品已清理）')
}

main()
  .then(async () => {
    await cleanup()
    console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`)
    await prisma.$disconnect()
    process.exit(fail ? 1 : 0)
  })
  .catch(async e => {
    console.error('脚本异常:', e)
    try { await cleanup() } catch (err) { console.error('清理失败:', err) }
    await prisma.$disconnect()
    process.exit(1)
  })
