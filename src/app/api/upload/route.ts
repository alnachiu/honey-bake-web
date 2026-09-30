import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

/**
 * 入库前把图片压到合理尺寸。
 *
 * 以前这里是原样写盘：店主用手机拍的商品图（4000×3000、2~5MB）直接进库，
 * 线上 44 张商品图就此攒到 105MB，前台列表页还按 200px 显示——等于每次浏览
 * 都在下相机原图。压缩放在入库这一步，是为了让「存下来的」和「要发的」一致，
 * 而不是在上传时省事、把开销挪给每一个访客。
 *
 * 长边 1600px 的依据：详情页最大按全屏宽展示，1600 已能覆盖手机 3 倍屏；
 * 再大对肉眼没有区别，只是白占磁盘和流量。
 */
const MAX_DIMENSION = 1600

/**
 * 按原格式压缩；任何一步失败都退回原图落盘。
 *
 * 上传失败比图片偏大严重得多——店主正在上架，不该因为一张图编码器的怪癖而卡住，
 * 所以这里吞掉异常而不是往外抛。
 */
async function compress(buffer: Buffer, ext: string): Promise<Buffer> {
  try {
    // 动图不处理：sharp 默认只取第一帧，压完动效就没了，得不偿失
    if (ext === 'gif') return buffer

    const pipeline = sharp(buffer, { failOn: 'none' })
      // 按 EXIF 方向摆正——手机竖拍的照片本身是横的，只靠 EXIF 标记，
      // 不 rotate 的话在网页上会躺倒
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })

    if (ext === 'png') return await pipeline.png({ compressionLevel: 9 }).toBuffer()
    if (ext === 'webp') return await pipeline.webp({ quality: 82 }).toBuffer()
    return await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer()
  } catch (error) {
    console.error('Compress error, 退回原图:', error)
    return buffer
  }
}

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
    const original = Buffer.from(bytes)
    const buffer = await compress(original, ext)

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
    return NextResponse.json({
      url,
      // 顺带回传体积，前台日志/排查时能直接看到压缩效果
      size: buffer.length,
      originalSize: original.length,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上传失败' }, { status: 500 })
  }
}
