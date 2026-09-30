import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

const TOKEN_NAME = 'honeybake_token'

// 曾经的写法是模块顶层 `const JWT_SECRET = process.env.JWT_SECRET || 'honey-bake-jwt-secret-key-2026'`。
// 两个问题：兜底值写在**公开仓库**里，等于把签名密钥印在门上，谁都能自签一张
// honeybake_token 冒充店主；而且 next.config.js 的 env 块会把它在构建期内联进产物
// （那个块已删），换 .env 根本不生效。
//
// 现在改成：只认环境变量，没有就报错。刻意做成**惰性**取值而不是模块顶层抛错——
// next build 会在构建期求值路由模块，顶层抛错会让镜像根本构建不出来；
// 改成用到时才校验，构建照常通过，运行时缺密钥立刻炸出可读错误。
let cachedSecret: string | null = null
function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET 未配置：请在运行环境（服务器上是项目目录的 .env）里设置 JWT_SECRET')
  }
  if (secret === 'honey-bake-jwt-secret-key-2026') {
    throw new Error('JWT_SECRET 仍是仓库里公开的旧值，必须换成新的随机密钥')
  }
  cachedSecret = secret
  return secret
}

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  // 取密钥这一步放在 try **外面**：配置缺失/仍是旧值属于部署事故，
  // 必须原样抛出去，不能被下面的 catch 吞成「未登录」——
  // 否则整个站点会表现为「谁登录都失败」而日志里一片安静，极难排查。
  const secret = getJwtSecret()
  try {
    return jwt.verify(token, secret) as JWTPayload
  } catch {
    return null
  }
}

export async function getAuthUser() {
  const cookieStore = cookies()
  const token = cookieStore.get(TOKEN_NAME)?.value
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    // memberExpire 供前端判断会员身份与展示会员价（不返回 password）
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      avatar: true,
      role: true,
      memberExpire: true
    }
  })

  return user
}

export async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('未登录')
  return user
}

export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'admin') throw new Error('权限不足')
  return user
}

export function setAuthCookie(token: string) {
  return {
    'Set-Cookie': `${TOKEN_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
  }
}

export function clearAuthCookie() {
  return {
    'Set-Cookie': `${TOKEN_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  }
}
