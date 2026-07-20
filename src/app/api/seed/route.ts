import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { execSync } from 'child_process'

/**
 * 数据初始化 API - 先创建数据库表，再填充示例数据
 * GET /api/seed
 */
export async function GET() {
  try {
    // 1. 先创建/更新数据库表
    console.log('Running prisma db push...')
    try {
      execSync('npx prisma db push --skip-generate', { stdio: 'pipe', timeout: 30000 })
      console.log('Database tables created/updated successfully')
    } catch (pushError) {
      console.error('prisma db push failed:', pushError)
      // 继续尝试，可能表已经存在
    }

    // 2. 检查是否已初始化
    try {
      const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@honeybake.com' } })
      if (existingAdmin) {
        return NextResponse.json({
          message: '✅ 数据已初始化，直接使用即可',
          accounts: {
            admin: 'admin@honeybake.com / admin123',
            user: 'user@test.com / user123'
          }
        })
      }
    } catch (checkError) {
      console.error('Check existing data failed:', checkError)
      // 表可能刚创建，继续初始化
    }

    // 3. 创建管理员
    const admin = await prisma.user.create({
      data: {
        email: 'admin@honeybake.com',
        name: '店主',
        password: await bcrypt.hash('admin123', 12),
        phone: '13800138000',
        role: 'admin',
      }
    })

    // 4. 创建测试用户
    await prisma.user.create({
      data: {
        email: 'user@test.com',
        name: '测试用户',
        password: await bcrypt.hash('user123', 12),
        phone: '13900139000',
        role: 'user',
      }
    })

    // 5. 创建商品
    const productsData = [
      { name: '手工黄油曲奇', price: 38, originalPrice: 48, category: '曲奇', stock: 100, sales: 256, images: JSON.stringify(['https://picsum.photos/seed/c1/400/400']), description: '精选新西兰黄油，酥脆可口', detail: '【配料】小麦粉、黄油、白砂糖、鸡蛋\n【净含量】200g\n【保质期】30天', tags: JSON.stringify(['热销', '经典']) },
      { name: '蔓越莓曲奇', price: 42, originalPrice: 52, category: '曲奇', stock: 80, sales: 189, images: JSON.stringify(['https://picsum.photos/seed/c2/400/400']), description: '酸甜蔓越莓搭配酥脆曲奇', tags: JSON.stringify(['人气']) },
      { name: '抹茶牛奶糖', price: 28, originalPrice: 35, category: '糖果', stock: 150, sales: 320, images: JSON.stringify(['https://picsum.photos/seed/c3/400/400']), description: '日式抹茶与香浓牛奶的完美融合', tags: JSON.stringify(['新品', '热销']) },
      { name: '巧克力杏仁脆', price: 45, originalPrice: 55, category: '零食', stock: 60, sales: 145, images: JSON.stringify(['https://picsum.photos/seed/c4/400/400']), description: '进口可可脂搭配香脆杏仁', tags: JSON.stringify(['经典']) },
      { name: '焦糖海盐太妃糖', price: 32, originalPrice: 38, category: '糖果', stock: 120, sales: 210, images: JSON.stringify(['https://picsum.photos/seed/c5/400/400']), description: '法式海盐焦糖，甜而不腻', tags: JSON.stringify(['热销']) },
      { name: '手工牛轧糖礼盒', price: 68, originalPrice: 88, category: '礼盒', stock: 40, sales: 98, images: JSON.stringify(['https://picsum.photos/seed/c6/400/400']), description: '四种口味精选，送礼佳品', tags: JSON.stringify(['礼盒', '推荐']) },
    ]
    for (const p of productsData) {
      await prisma.product.create({ data: { ...p, unit: '份', status: 'on' } })
    }

    // 6. 创建优惠券
    const coupons = [
      { name: '新客专享', type: 'reduce', value: 5, minAmount: 0, stock: 100, startTime: '2026-01-01', endTime: '2026-12-31', description: '无门槛使用' },
      { name: '满68减10', type: 'reduce', value: 10, minAmount: 68, stock: 50, startTime: '2026-01-01', endTime: '2026-12-31', description: '满68元可用' },
      { name: '满128减20', type: 'reduce', value: 20, minAmount: 128, stock: 30, startTime: '2026-01-01', endTime: '2026-12-31', description: '满128元可用' },
      { name: '全场9折券', type: 'discount', value: 9, minAmount: 0, stock: 50, startTime: '2026-01-01', endTime: '2026-12-31', description: '全场商品打9折' },
    ]
    for (const c of coupons) {
      await prisma.coupon.create({ data: c })
    }

    // 7. 创建管理员地址
    await prisma.address.create({ data: { userId: admin.id, name: '甜蜜烘焙坊', phone: '13800138000', region: '广东省广州市天河区', detail: '甜蜜路1号烘焙坊', isDefault: true } })

    return NextResponse.json({
      success: true,
      message: '🎉 数据初始化完成！',
      accounts: {
        admin: 'admin@honeybake.com / admin123',
        user: 'user@test.com / user123'
      },
      stats: {
        products: productsData.length,
        coupons: coupons.length,
        users: 2
      }
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : '初始化失败',
      detail: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
