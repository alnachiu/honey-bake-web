import { NextResponse } from 'next/server'
import { isValidPhone } from '@/lib/utils'
import { getMemberDiscountRateByPhone } from '@/lib/membership'

// 同 /api/settings：这个 GET 不读 cookies，Next 会试图静态预渲染它，
// 而静态化的 Route Handler 行为受限（读 searchParams 的请求拿不到真实参数）。
// 显式声明动态，避免生产环境上的表现和开发环境不一致。
export const dynamic = 'force-dynamic'

/**
 * 结算页用：这个手机号是不是会员？
 *
 * 只回 isMember 和 discount 两个字段——不回姓名、邮箱、到期日。
 * 结算页只需要知道「要不要提示他去登录」和「大概能省多少」，
 * 多回任何身份信息都会让这个免登录接口变成手机号撞库的信息源。
 */
export async function GET(request: Request) {
  try {
    const phone = new URL(request.url).searchParams.get('phone') || ''

    // 格式不对直接当非会员处理，不查库，避免被拿来扫任意字符串
    if (!isValidPhone(phone)) {
      return NextResponse.json({ isMember: false, discount: 1 })
    }

    const discount = await getMemberDiscountRateByPhone(phone)
    return NextResponse.json({ isMember: discount < 1, discount })
  } catch (error) {
    console.error('Membership check error:', error)
    // 查询失败时按非会员回，前端只是不显示提示条，不影响下单
    return NextResponse.json({ isMember: false, discount: 1 })
  }
}
