import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const { name } = params

    // 安全检查：防止目录穿越攻击（如 ../../etc/passwd）
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const filePath = path.join(process.cwd(), 'uploads', name)
    const file = await readFile(filePath)

    // 根据扩展名设置 MIME 类型
    const ext = name.split('.').pop()?.toLowerCase()
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const contentType = mimeMap[ext || ''] || 'application/octet-stream'

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        // 缓存 30 天，提升加载速度
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    })
  } catch (error) {
    console.error('Serve upload error:', error)
    return new NextResponse('Not Found', { status: 404 })
  }
}
