import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 开始初始化数据...')

  // 创建管理员
  const adminPassword = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@honeybake.com' },
    update: {},
    create: {
      email: 'admin@honeybake.com',
      name: '店主',
      password: adminPassword,
      phone: '13800138000',
      role: 'admin',
    }
  })
  console.log('✅ 管理员账号: admin@honeybake.com / admin123')

  // 创建测试用户
  const userPassword = await bcrypt.hash('user123', 12)
  await prisma.user.upsert({
    where: { email: 'user@test.com' },
    update: {},
    create: {
      email: 'user@test.com',
      name: '测试用户',
      password: userPassword,
      phone: '13900139000',
      role: 'user',
    }
  })
  console.log('✅ 测试用户: user@test.com / user123')

  // 创建商品
  const products = [
    {
      name: '手工黄油曲奇',
      price: 38.00,
      originalPrice: 48.00,
      category: '曲奇',
      unit: '盒',
      stock: 100, sales: 256,
      images: JSON.stringify(['https://picsum.photos/seed/cookie1/400/400']),
      description: '精选新西兰黄油，酥脆可口，入口即化',
      detail: '【配料】小麦粉、黄油、白砂糖、鸡蛋\n【净含量】200g\n【保质期】30天\n【存储条件】阴凉干燥处保存',
      tags: JSON.stringify(['热销', '经典']),
      status: 'on'
    },
    {
      name: '蔓越莓曲奇',
      price: 42.00,
      originalPrice: 52.00,
      category: '曲奇',
      unit: '盒', stock: 80, sales: 189,
      images: JSON.stringify(['https://picsum.photos/seed/cookie2/400/400']),
      description: '酸甜蔓越莓搭配酥脆曲奇',
      detail: '【配料】小麦粉、黄油、蔓越莓干、白砂糖\n【净含量】200g\n【保质期】30天',
      tags: JSON.stringify(['人气']), status: 'on'
    },
    {
      name: '抹茶牛奶糖',
      price: 28.00,
      originalPrice: 35.00,
      category: '糖果',
      unit: '袋', stock: 150, sales: 320,
      images: JSON.stringify(['https://picsum.photos/seed/candy1/400/400']),
      description: '日式抹茶与香浓牛奶的完美融合',
      detail: '【配料】白砂糖、麦芽糖、抹茶粉、奶粉\n【净含量】150g\n【保质期】60天',
      tags: JSON.stringify(['新品', '热销']), status: 'on'
    },
    {
      name: '巧克力杏仁脆',
      price: 45.00,
      originalPrice: 55.00,
      category: '零食',
      unit: '罐', stock: 60, sales: 145,
      images: JSON.stringify(['https://picsum.photos/seed/snack1/400/400']),
      description: '进口可可脂搭配香脆杏仁',
      detail: '【配料】可可脂、杏仁片、小麦粉、黄油\n【净含量】180g\n【保质期】45天',
      tags: JSON.stringify(['经典']), status: 'on'
    },
    {
      name: '焦糖海盐太妃糖',
      price: 32.00,
      originalPrice: 38.00,
      category: '糖果',
      unit: '袋', stock: 120, sales: 210,
      images: JSON.stringify(['https://picsum.photos/seed/candy2/400/400']),
      description: '法式海盐焦糖，甜而不腻',
      detail: '【配料】淡奶油、白砂糖、麦芽糖、海盐\n【净含量】120g\n【保质期】60天',
      tags: JSON.stringify(['热销']), status: 'on'
    },
    {
      name: '手工牛轧糖礼盒',
      price: 68.00,
      originalPrice: 88.00,
      category: '礼盒',
      unit: '盒', stock: 40, sales: 98,
      images: JSON.stringify(['https://picsum.photos/seed/gift1/400/400']),
      description: '四种口味精选，送礼佳品',
      detail: '【口味】原味、抹茶、巧克力、蔓越莓\n【净含量】400g\n【保质期】45天\n【包装】精美礼盒装',
      tags: JSON.stringify(['礼盒', '推荐']), status: 'on'
    }
  ]

  for (const product of products) {
    await prisma.product.create({ data: product })
  }
  console.log(`✅ 创建了 ${products.length} 个商品`)

  // 创建优惠券
  const coupons = [
    { name: '新客专享', type: 'reduce', value: 5, minAmount: 0, stock: 100, startTime: '2026-01-01', endTime: '2026-12-31', description: '无门槛使用' },
    { name: '满68减10', type: 'reduce', value: 10, minAmount: 68, stock: 50, startTime: '2026-01-01', endTime: '2026-12-31', description: '满68元可用' },
    { name: '满128减20', type: 'reduce', value: 20, minAmount: 128, stock: 30, startTime: '2026-01-01', endTime: '2026-12-31', description: '满128元可用' },
    { name: '全场9折券', type: 'discount', value: 9, minAmount: 0, stock: 50, startTime: '2026-01-01', endTime: '2026-12-31', description: '全场商品打9折' },
  ]

  for (const coupon of coupons) {
    await prisma.coupon.create({ data: coupon })
  }
  console.log(`✅ 创建了 ${coupons.length} 个优惠券`)

  // 创建管理员地址
  await prisma.address.create({
    data: {
      userId: admin.id,
      name: '甜蜜烘焙坊',
      phone: '13800138000',
      region: '广东省广州市天河区',
      detail: '甜蜜路1号烘焙坊',
      isDefault: true
    }
  })

  console.log('🎉 数据初始化完成！')
  console.log('')
  console.log('📝 登录账号:')
  console.log('   管理员: admin@honeybake.com / admin123')
  console.log('   用户:   user@test.com / user123')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
