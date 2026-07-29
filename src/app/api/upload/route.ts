import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

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

    // 检查 Cloudinary 是否已配置
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: '图片存储服务未配置，请联系管理员设置 Cloudinary' }, { status: 500 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 上传到 Cloudinary
    const result = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'honey-bake',
          resource_type: 'image',
          format: ext === 'jpg' ? 'jpg' : ext,
          quality: 'auto',
          fetch_format: 'auto',
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result!.secure_url)
        }
      )
      uploadStream.end(buffer)
    })

    return NextResponse.json({ url: result })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上传失败，请稍后重试' }, { status: 500 })
  }
}
