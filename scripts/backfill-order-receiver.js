#!/usr/bin/env node
/*
 * 存量订单收货信息回填（一次性脚本）。
 *
 * 背景：Order 上原来只存 addressId，收货人/电话/地址全靠关联 Address 行读出来。
 * 于是顾客在「地址管理」里改一下或删掉地址，历史订单的收货信息就跟着变或直接空白。
 * 现在下单时会把这四项快照到订单上，但**已经躺在库里的老订单没有快照**——
 * 这个脚本就是补这一刀。
 *
 * 用法：
 *   node scripts/backfill-order-receiver.js             # 正式回填
 *   node scripts/backfill-order-receiver.js --dry-run   # 只看会写什么，不落库
 *
 * ⚠️ 已删过地址的订单救不回来：那些单的 addressId 早被置空，原始收货信息
 *    在库里已经不存在了，脚本只能跳过并把数量报给你。这是不可恢复的历史损失。
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`=== 存量订单收货信息回填${dryRun ? '（试运行）' : ''} ===\n`)

  // 只挑「四项快照全空」的订单，避免把已经回填过的再写一遍。
  // 不按 addressId 是否为空过滤：addressId 还在、但快照为空的老单也要补。
  const pending = await prisma.order.findMany({
    where: {
      receiverName: null,
      receiverPhone: null,
      receiverRegion: null,
      receiverDetail: null
    },
    include: { address: true },
    orderBy: { createdAt: 'asc' }
  })

  const total = await prisma.order.count()
  console.log(`订单总数：${total}`)
  console.log(`需要回填：${pending.length}\n`)

  if (!pending.length) {
    console.log('没有需要回填的订单。')
    return
  }

  let filled = 0
  let orphan = 0
  let skipped = 0

  for (const order of pending) {
    if (!order.address) {
      // addressId 已被置空（顾客删过地址），或本来就是无地址的订单。
      // 原始信息不在库里了，只能跳过。
      orphan++
      continue
    }

    const { name, phone, region, detail } = order.address
    if (!name && !phone && !detail) {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  ${order.orderNo}  ← ${name} ${phone} ${region} ${detail}`)
    } else {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          receiverName: name,
          receiverPhone: phone,
          receiverRegion: region,
          receiverDetail: detail
        }
      })
    }
    filled++
  }

  console.log(`\n${dryRun ? '将回填' : '已回填'}：${filled} 单`)
  if (orphan) console.log(`跳过（地址已删除，原始信息不可恢复）：${orphan} 单`)
  if (skipped) console.log(`跳过（关联地址本身是空的）：${skipped} 单`)
  if (dryRun) console.log('\n试运行结束，未改动任何数据。')
}

main()
  .catch(err => {
    console.error('执行失败：', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
