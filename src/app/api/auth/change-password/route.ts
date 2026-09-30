import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, verifyPassword, hashPassword } from '@/lib/auth'

// 修改密码：校验原密码，更新为新密码（bcrypt 加密存储）
// 修改后已登录会话（JWT）不失效，无需重新登录
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { oldPassword, newPassword } = await request.json()

    // 注意这里**不能**要求 oldPassword 非空。没有密码的账号（手机号自动建号、
    // 或被店主清除了密码）走的是「设置密码」语义，前端那块表单压根不显示原密码输入框。
    // 把必填校验放在前面会把「清除密码后用户自行重设」这条路直接堵死成 400。
    if (!newPassword) {
      return NextResponse.json({ error: '请填写新密码' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少6位' }, { status: 400 })
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    // 只有本来就有密码的账号才校验原密码。
    // 注意：不校验不等于漏洞——能走到这一行说明请求方已经持有该用户的有效登录态。
    if (dbUser.password) {
      if (!oldPassword) {
        return NextResponse.json({ error: '请填写原密码' }, { status: 400 })
      }
      const valid = await verifyPassword(oldPassword, dbUser.password)
      if (!valid) {
        return NextResponse.json({ error: '原密码错误' }, { status: 400 })
      }
    }

    const hashed = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed }
    })

    return NextResponse.json({ success: true, message: '密码修改成功' })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: '修改失败，请稍后重试' }, { status: 500 })
  }
}
