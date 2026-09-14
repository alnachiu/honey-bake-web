/* 优惠券四项增强的端到端回归：买赠券 / 领取时间维度 / 会员卡自动推券 / 显隐开关。
   跑法：先 npm run dev（或 next start），再 node scripts/e2e-coupon-v2.js [baseUrl]

   本脚本会改动全局「会员折扣率」，开头备份、结尾还原；
   为让金额断言确定，运行期间会把它临时设为 1（不打折）。 */
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

/** 清理所需的材料，cleanup() 从这里读（见其注释） */
const state = { userId: '', createdCouponIds: [], createdPlanIds: [], restoreRate: NaN, admin: null }

async function main() {
  const stamp = Date.now()
  const userEmail = `e2e_cv2_${stamp}@test.com`
  const userPass = 'Test123456'
  const createdCouponIds = state.createdCouponIds
  const createdPlanIds = state.createdPlanIds

  // 号码带 stamp 且与 e2e-member 的号段（137）错开，避免多次运行互相占用；
  // 再撞一次真数据就会像上一轮那样把测试订单写进管理员账号，所以先探一次。
  const testPhone = '136' + String(stamp).slice(-8)
  const clash = await prisma.user.findFirst({ where: { phone: testPhone }, select: { id: true } })
  if (clash) {
    console.log(`手机号 ${testPhone} 已被占用，请稍后重试`)
    process.exit(1)
  }

  const admin = makeClient()
  const loginRes = await admin.req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@honeybake.com', password: 'admin123' })
  })
  if (!loginRes.ok) {
    console.log('无法登录管理员账号(admin@honeybake.com/admin123)，先跑一次 /api/seed 或改脚本里的口令')
    process.exit(1)
  }

  // 会员折扣率是全局设置：备份 → 临时设成 1 → 结尾还原。
  // 不固定成 1 的话，「赠品券不改金额」那条断言会被会员折扣搅浑。
  const settingsRow = await prisma.shopSetting.findFirst({ where: { id: 'default' } })
  const restoreRate = settingsRow?.memberDiscount ?? 1
  state.restoreRate = restoreRate
  state.admin = admin
  await admin.req('/api/settings', { method: 'PUT', body: JSON.stringify({ memberDiscount: 1 }) })

  const userClient = makeClient()
  const reg = await userClient.req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, name: 'E2E券测试', password: userPass })
  })
  ok('注册测试用户', reg.ok, JSON.stringify(reg.data))
  if (!reg.ok) process.exit(1)
  const userId = reg.data.user.id
  state.userId = userId

  const bindPhone = await userClient.req('/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ phone: testPhone })
  })
  ok('绑定手机号（买会员卡的凭证）', bindPhone.ok, JSON.stringify(bindPhone.data))
  if (!bindPhone.ok) process.exit(1)

  // 券的公共默认值：日期窗口覆盖当下，perUserLimit=0 表示不限，便于单独验证时间维度
  const couponBody = (overrides = {}) => ({
    name: `E2E_${stamp}`, type: 'reduce', value: 5, minAmount: 0, stock: 0,
    perUserLimit: 0, stackable: false, validMode: 'fixed',
    startTime: '2025-01-01T00:00', endTime: '2035-12-31T23:59',
    ...overrides
  })
  const createCoupon = async (overrides = {}) => {
    const res = await admin.req('/api/coupons', { method: 'POST', body: JSON.stringify(couponBody(overrides)) })
    if (res.data?.coupon?.id) createdCouponIds.push(res.data.coupon.id)
    return res
  }

  console.log('\n== 1. 买赠券：创建与校验 ==')
  const giftRes = await createCoupon({
    name: `E2E_${stamp}_买赠`, type: 'gift',
    giftName: '手工曲奇一盒', giftQuantity: 2
    // 故意不传 value：买赠券不该要求填额度
  })
  const giftCoupon = giftRes.data?.coupon
  ok('创建买赠券成功', giftRes.ok && !!giftCoupon, JSON.stringify(giftRes.data))
  // 不改三值白名单的话，这里会被静默改写成满减券
  ok('type 保持 gift（没被改写成满减）', giftCoupon?.type === 'gift', `type=${giftCoupon?.type}`)
  ok('value 恒为 0', giftCoupon?.value === 0, `value=${giftCoupon?.value}`)
  ok('赠品名称与数量落库', giftCoupon?.giftName === '手工曲奇一盒' && giftCoupon?.giftQuantity === 2,
    JSON.stringify({ n: giftCoupon?.giftName, q: giftCoupon?.giftQuantity }))

  const noGiftName = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ type: 'gift', giftName: '', giftQuantity: 1 }))
  })
  ok('赠品名称为空 → 400', noGiftName.status === 400, `status=${noGiftName.status}`)

  const zeroQty = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ type: 'gift', giftName: '曲奇', giftQuantity: 0 }))
  })
  ok('赠品数量为 0 → 400', zeroQty.status === 400, `status=${zeroQty.status}`)

  const halfRolling = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ rollingDays: 7, rollingLimit: 0 }))
  })
  ok('滚动窗口只填天数 → 400', halfRolling.status === 400, `status=${halfRolling.status}`)

  const halfRolling2 = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ rollingDays: 0, rollingLimit: 2 }))
  })
  ok('滚动窗口只填张数 → 400', halfRolling2.status === 400, `status=${halfRolling2.status}`)

  const halfPeriod = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ periodType: 'day', periodCount: 0 }))
  })
  ok('自然周期选了周期却没填张数 → 400', halfPeriod.status === 400, `status=${halfPeriod.status}`)

  const halfPeriod2 = await admin.req('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(couponBody({ periodType: 'none', periodCount: 3 }))
  })
  ok('自然周期填了张数却没选周期 → 400', halfPeriod2.status === 400, `status=${halfPeriod2.status}`)

  console.log('\n== 2. 隐藏券：消费者看不到、也不能自领 ==')
  const hiddenRes = await createCoupon({ name: `E2E_${stamp}_隐藏`, value: 5, visible: false })
  const hiddenId = hiddenRes.data?.coupon?.id
  ok('创建隐藏券成功且 visible=false', hiddenRes.ok && hiddenRes.data.coupon.visible === false, JSON.stringify(hiddenRes.data))

  const listForUser = await userClient.req('/api/coupons')
  ok('用户列表里看不到隐藏券', listForUser.ok && !(listForUser.data.coupons || []).some(c => c.id === hiddenId),
    `含隐藏券=${(listForUser.data.coupons || []).some(c => c.id === hiddenId)}`)
  ok('用户列表里能看到可见券', listForUser.ok && (listForUser.data.coupons || []).some(c => c.id === giftCoupon.id))

  const listForAdmin = await admin.req('/api/coupons?all=true')
  ok('后台列表仍能看到隐藏券', listForAdmin.ok && (listForAdmin.data.coupons || []).some(c => c.id === hiddenId))

  const claimHidden = await userClient.req('/api/coupons/claim', {
    method: 'POST',
    body: JSON.stringify({ couponId: hiddenId })
  })
  ok('自助领取隐藏券 → 400', claimHidden.status === 400, `status=${claimHidden.status} ${JSON.stringify(claimHidden.data)}`)

  console.log('\n== 3. 隐藏券仍然有效：推送后照常下单抵扣 ==')
  // 先让测试用户成为会员——推送接口只发给在期会员
  const plan0 = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E_${stamp}_体验卡`, price: 1, days: 30, sort: 1 })
  })
  ok('创建体验卡套餐', plan0.ok, JSON.stringify(plan0.data))
  if (plan0.data?.plan?.id) createdPlanIds.push(plan0.data.plan.id)
  const plan0Id = plan0.data.plan.id

  const buy0 = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: plan0Id }) })
  const confirm0 = await admin.req(`/api/membership/orders/${buy0.data.order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ id: buy0.data.order.id, action: 'confirm' })
  })
  ok('测试用户成为会员', confirm0.ok && confirm0.data.order?.status === 'paid', JSON.stringify(confirm0.data))

  const pushHidden = await admin.req(`/api/coupons/${hiddenId}/push`, { method: 'POST' })
  ok('隐藏券可以被推送（隐藏 ≠ 作废）', pushHidden.ok && pushHidden.data.sent >= 1, JSON.stringify(pushHidden.data))

  const myHidden = await prisma.userCoupon.findFirst({ where: { userId, couponId: hiddenId, status: 'active' } })
  ok('推送后进入券包', !!myHidden, JSON.stringify(myHidden))

  const realProduct = await prisma.product.findFirst({ select: { id: true, name: true } })
  const items200 = [{ productId: realProduct.id, name: realProduct.name, price: 200, quantity: 1, unit: '份' }]

  const hiddenOrder = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: items200, userCouponIds: [myHidden.id], address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  ok('隐藏券下单可用且抵扣生效', hiddenOrder.ok && hiddenOrder.data.order?.couponDiscount === 5,
    JSON.stringify(hiddenOrder.data))
  const hiddenBurned = await prisma.userCoupon.findUnique({ where: { id: myHidden.id } })
  ok('隐藏券被正常核销', hiddenBurned?.status === 'used', `status=${hiddenBurned?.status}`)

  console.log('\n== 4. 滚动窗口：最近 7 天最多 1 张 ==')
  const rollingRes = await createCoupon({ name: `E2E_${stamp}_滚动`, rollingDays: 7, rollingLimit: 1 })
  const rollingId = rollingRes.data.coupon.id
  ok('创建滚动限领券', rollingRes.ok && rollingRes.data.coupon.rollingDays === 7 && rollingRes.data.coupon.rollingLimit === 1,
    JSON.stringify(rollingRes.data))

  const roll1 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: rollingId }) })
  ok('第 1 张领取成功', roll1.ok && roll1.data.success, JSON.stringify(roll1.data))

  const roll2 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: rollingId }) })
  ok('第 2 张被滚动窗口拦下', roll2.status === 400, `status=${roll2.status}`)
  ok('拦截文案点出了窗口天数', typeof roll2.data?.error === 'string' && roll2.data.error.includes('7 天'), JSON.stringify(roll2.data))

  // 把已有那张挪到窗口之外：如果窗口是假的（写死的一次性限制），这一领就会失败
  await prisma.userCoupon.updateMany({
    where: { userId, couponId: rollingId },
    data: { claimTime: new Date(Date.now() - 8 * 86400000) }
  })
  const roll3 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: rollingId }) })
  ok('窗口滑过去后可以再领（真在滚动）', roll3.ok && roll3.data.success, JSON.stringify(roll3.data))

  console.log('\n== 5. 自然周期：每天最多 1 张 ==')
  const periodRes = await createCoupon({ name: `E2E_${stamp}_每天`, periodType: 'day', periodCount: 1 })
  const periodId = periodRes.data.coupon.id
  ok('创建自然周期限领券', periodRes.ok && periodRes.data.coupon.periodType === 'day' && periodRes.data.coupon.periodCount === 1,
    JSON.stringify(periodRes.data))

  const per1 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: periodId }) })
  ok('今天第 1 张领取成功', per1.ok && per1.data.success, JSON.stringify(per1.data))

  const per2 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: periodId }) })
  ok('今天第 2 张被周期拦下', per2.status === 400, `status=${per2.status}`)

  await prisma.userCoupon.updateMany({
    where: { userId, couponId: periodId },
    data: { claimTime: new Date(Date.now() - 26 * 3600000) } // 昨天
  })
  const per3 = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: periodId }) })
  ok('跨到新的一天后可以再领', per3.ok && per3.data.success, JSON.stringify(per3.data))

  console.log('\n== 6. 买赠券下单：送赠品、不改金额 ==')
  const giftClaim = await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: giftCoupon.id }) })
  ok('领取买赠券', giftClaim.ok && giftClaim.data.success, JSON.stringify(giftClaim.data))
  const ucGift = await prisma.userCoupon.findFirst({ where: { userId, couponId: giftCoupon.id, status: 'active' } })

  const giftOrder = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: items200, userCouponIds: [ucGift.id], address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  const go = giftOrder.data?.order
  ok('用买赠券下单成功', giftOrder.ok && !!go, JSON.stringify(giftOrder.data))
  if (go) {
    ok('订单记下赠品名称与数量', go.giftName === '手工曲奇一盒' && go.giftQuantity === 2,
      JSON.stringify({ n: go.giftName, q: go.giftQuantity }))
    ok('商品金额仍为 200（赠品不计入）', go.itemsAmount === 200, `itemsAmount=${go.itemsAmount}`)
  }

  // 同样商品、不用券再下一单：两单实付必须完全一致，证明赠品券一个子儿都没动
  const plainOrder = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: items200, address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  const po = plainOrder.data?.order
  ok('不用券的对照单金额一致', !!po && !!go && po.totalAmount === go.totalAmount,
    `赠品券单=${go?.totalAmount} 对照单=${po?.totalAmount}`)
  ok('对照单没有赠品', po?.giftName === '' && po?.giftQuantity === 0, JSON.stringify({ n: po?.giftName, q: po?.giftQuantity }))

  const giftBurned = await prisma.userCoupon.findUnique({ where: { id: ucGift.id } })
  ok('买赠券被核销（没被剔除循环悄悄吞掉）', giftBurned?.status === 'used', `status=${giftBurned?.status}`)

  console.log('\n== 7. 只用买赠券不能付款 ==')
  const emptyOrder = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [], address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  ok('空订单 → 400', emptyOrder.status === 400, `status=${emptyOrder.status}`)

  // 赠品只能由服务端按券推导：前端自己传 giftName 必须被无视
  const spoof = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: items200, giftName: '免费蛋糕', giftQuantity: 99, address: { name: 'T', phone: '13800000000', detail: '测试地址' } })
  })
  ok('前端自带的赠品字段被忽略', spoof.ok && spoof.data.order?.giftName === '' && spoof.data.order?.giftQuantity === 0,
    JSON.stringify({ n: spoof.data.order?.giftName, q: spoof.data.order?.giftQuantity }))

  console.log('\n== 8. 一次只能用一张买赠券 ==')
  const giftA = await createCoupon({ name: `E2E_${stamp}_买赠A`, type: 'gift', giftName: 'A赠品', giftQuantity: 1, stackable: true })
  const giftB = await createCoupon({ name: `E2E_${stamp}_买赠B`, type: 'gift', giftName: 'B赠品', giftQuantity: 1, stackable: true })
  for (const id of [giftA.data.coupon.id, giftB.data.coupon.id]) {
    await userClient.req('/api/coupons/claim', { method: 'POST', body: JSON.stringify({ couponId: id }) })
  }
  const ucA = await prisma.userCoupon.findFirst({ where: { userId, couponId: giftA.data.coupon.id, status: 'active' } })
  const ucB = await prisma.userCoupon.findFirst({ where: { userId, couponId: giftB.data.coupon.id, status: 'active' } })

  const twoGifts = await userClient.req('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: items200, userCouponIds: [ucA.id, ucB.id],
      address: { name: 'T', phone: '13800000000', detail: '测试地址' }
    })
  })
  ok('两张买赠券一起用 → 400', twoGifts.status === 400, `status=${twoGifts.status} ${JSON.stringify(twoGifts.data)}`)
  ok('提示说明了一次只能一张', typeof twoGifts.data?.error === 'string' && twoGifts.data.error.includes('最多使用一张买赠券'),
    JSON.stringify(twoGifts.data))

  const stillActive = await prisma.userCoupon.count({ where: { id: { in: [ucA.id, ucB.id] }, status: 'active' } })
  ok('被拒后两张券都没被核销', stillActive === 2, `active=${stillActive}`)

  console.log('\n== 9. 会员卡自动推券 ==')
  const autoA = await createCoupon({ name: `E2E_${stamp}_会员券A`, value: 3 })
  const autoB = await createCoupon({ name: `E2E_${stamp}_会员券B`, value: 4 })
  const autoAId = autoA.data.coupon.id
  const autoBId = autoB.data.coupon.id

  const planAuto = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E_${stamp}_年卡`, price: 99, days: 365, sort: 2, couponIds: [autoAId, autoBId] })
  })
  ok('创建套餐并绑定 2 张券', planAuto.ok && (planAuto.data.plan?.couponIds || []).length === 2, JSON.stringify(planAuto.data))
  const planAutoId = planAuto.data.plan.id
  if (planAutoId) createdPlanIds.push(planAutoId)

  const planList = await admin.req('/api/membership/plans?all=true')
  const listed = (planList.data.plans || []).find(p => p.id === planAutoId)
  ok('后台套餐列表回显绑定的券', (listed?.couponIds || []).length === 2, JSON.stringify(listed?.couponIds))

  const badCoupon = await admin.req('/api/membership/plans', {
    method: 'PUT',
    body: JSON.stringify({ id: planAutoId, name: 'x', price: 99, days: 365, sort: 2, couponIds: ['no_such_coupon_id'] })
  })
  ok('绑定不存在的券 → 400', badCoupon.status === 400, `status=${badCoupon.status}`)

  const beforeA = await prisma.userCoupon.count({ where: { userId, couponId: autoAId } })
  const beforeB = await prisma.userCoupon.count({ where: { userId, couponId: autoBId } })
  // 通知数按「确认前后之差」算：这个用户在组 3 已经被推过一张券，只数总量会串味
  const notiBefore = await prisma.notification.count({ where: { userId, type: 'coupon' } })
  const buyAuto = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: planAutoId }) })
  const confirmAuto = await admin.req(`/api/membership/orders/${buyAuto.data.order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ id: buyAuto.data.order.id, action: 'confirm' })
  })
  ok('确认收款返回推送券数', confirmAuto.ok && confirmAuto.data.pushedCoupons === 2, JSON.stringify(confirmAuto.data))

  const afterA = await prisma.userCoupon.count({ where: { userId, couponId: autoAId } })
  const afterB = await prisma.userCoupon.count({ where: { userId, couponId: autoBId } })
  ok('券包各多 1 张（A）', afterA - beforeA === 1, `${beforeA} → ${afterA}`)
  ok('券包各多 1 张（B）', afterB - beforeB === 1, `${beforeB} → ${afterB}`)

  const notiAfter = await prisma.notification.count({ where: { userId, type: 'coupon' } })
  ok('收到 2 条券到账通知', notiAfter - notiBefore === 2, `${notiBefore} → ${notiAfter}`)
  const autoNoti = await prisma.notification.findFirst({
    where: { userId, type: 'coupon', title: { contains: '会员专属' } }
  })
  ok('通知标题标明是会员专属券', !!autoNoti, JSON.stringify(autoNoti))

  // 续费再确认一次：按店主的要求不去重，再发一遍
  const buyAuto2 = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: planAutoId }) })
  const confirmAuto2 = await admin.req(`/api/membership/orders/${buyAuto2.data.order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ id: buyAuto2.data.order.id, action: 'confirm' })
  })
  const renewA = await prisma.userCoupon.count({ where: { userId, couponId: autoAId } })
  ok('续费再发一遍（不去重）', confirmAuto2.data.pushedCoupons === 2 && renewA - beforeA === 2, `持有 ${renewA} 张`)

  console.log('\n== 10. 已下架 / 已过期的券不推 ==')
  const inactiveCoupon = await createCoupon({ name: `E2E_${stamp}_下架券`, value: 6 })
  await prisma.coupon.update({ where: { id: inactiveCoupon.data.coupon.id }, data: { status: 'inactive' } })

  const expiredCoupon = await createCoupon({
    name: `E2E_${stamp}_过期券`, value: 6,
    startTime: '2019-01-01T00:00', endTime: '2020-01-01T00:00'
  })

  const planSkip = await admin.req('/api/membership/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E_${stamp}_不推券卡`, price: 9, days: 30, sort: 3,
      couponIds: [inactiveCoupon.data.coupon.id, expiredCoupon.data.coupon.id]
    })
  })
  ok('下架/过期券仍可绑定（只是不发）', planSkip.ok, JSON.stringify(planSkip.data))
  const planSkipId = planSkip.data.plan.id
  if (planSkipId) createdPlanIds.push(planSkipId)

  const buySkip = await userClient.req('/api/membership/orders', { method: 'POST', body: JSON.stringify({ planId: planSkipId }) })
  const confirmSkip = await admin.req(`/api/membership/orders/${buySkip.data.order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ id: buySkip.data.order.id, action: 'confirm' })
  })
  ok('开通成功但不推券', confirmSkip.ok && confirmSkip.data.pushedCoupons === 0, JSON.stringify(confirmSkip.data))

  const skipA = await prisma.userCoupon.count({ where: { userId, couponId: inactiveCoupon.data.coupon.id } })
  const skipB = await prisma.userCoupon.count({ where: { userId, couponId: expiredCoupon.data.coupon.id } })
  ok('下架券没进券包', skipA === 0, `count=${skipA}`)
  ok('过期券没进券包', skipB === 0, `count=${skipB}`)

  console.log('\n== 11. 后台列表带回新字段 ==')
  const adminList = await admin.req('/api/coupons?all=true')
  const giftInList = (adminList.data.coupons || []).find(c => c.id === giftCoupon.id)
  ok('后台列表带回买赠券的赠品信息', giftInList?.giftName === '手工曲奇一盒' && giftInList?.giftQuantity === 2,
    JSON.stringify({ n: giftInList?.giftName, q: giftInList?.giftQuantity }))
  const boundInList = (adminList.data.coupons || []).find(c => c.id === autoAId)
  ok('后台列表标出「哪张卡会自动推这张券」', (boundInList?.autoPushPlans || []).length === 1,
    JSON.stringify(boundInList?.autoPushPlans))
}

/**
 * 清理本次测试造出来的用户 / 订单 / 券 / 套餐，并把全局折扣率还原。
 * 走模块级变量而不是参数：断言失败不会抛异常，但接口返回形状变了会，
 * 那条路径也要能把脏数据收干净。
 */
async function cleanup() {
  if (state.userId) {
    const orders = await prisma.order.findMany({ where: { userId: state.userId }, select: { id: true } })
    const orderIds = orders.map(o => o.id)
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.address.deleteMany({ where: { userId: state.userId } })
    await prisma.userCoupon.deleteMany({ where: { userId: state.userId } })
    await prisma.notification.deleteMany({ where: { userId: state.userId } })
    await prisma.membershipOrder.deleteMany({ where: { userId: state.userId } })
    await prisma.user.deleteMany({ where: { id: state.userId } })
  }
  // 券要先把所有用户已领的记录清掉再删（等价于 DELETE /api/coupons 的行为），
  // 否则外键会直接拦下来。套餐绑定行靠 onDelete: Cascade 自动清。
  if (state.createdCouponIds.length) {
    await prisma.userCoupon.deleteMany({ where: { couponId: { in: state.createdCouponIds } } })
    await prisma.coupon.deleteMany({ where: { id: { in: state.createdCouponIds } } })
  }
  if (state.createdPlanIds.length) {
    await prisma.membershipPlan.deleteMany({ where: { id: { in: state.createdPlanIds } } })
  }
  // 折扣率是全局设置，别把开发库留在「不打折」上
  if (Number.isFinite(state.restoreRate) && state.admin) {
    await state.admin.req('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ memberDiscount: state.restoreRate })
    })
  }
  console.log('\n（已清理本次测试产生的用户/订单/券/套餐，会员折扣率已还原）')
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
