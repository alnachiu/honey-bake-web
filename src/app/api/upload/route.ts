import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: '请选择图片' }, { status: 400 })
    }

    // 验证文件类型
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json({ error: '仅支持 JPG/PNG/GIF/WebP 格式' }, { status: 400 })
    }

    // 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '图片不能超过 5MB' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 生成唯一文件名
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    // 上传目录优先读环境变量（部署时指向持久化卷），本地开发回退到项目内 uploads/
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

    // 确保目录存在
    await mkdir(uploadDir, { recursive: true })

    const filePath = path.join(uploadDir, fileName)
    await writeFile(filePath, buffer)

    // 返回 API 路由的 URL，由专门的路由提供图片服务
    const url = `/api/uploads/${fileName}`
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上传失败' }, { status: 500 })
  }
}
