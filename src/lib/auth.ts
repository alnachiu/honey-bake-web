import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'honey-bake-jwt-secret-key-2026'
const TOKEN_NAME = 'honeybake_token'

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
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
    select: { id: true, email: true, name: true, phone: true, avatar: true, role: true }
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
