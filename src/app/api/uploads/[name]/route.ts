import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

/**
 * 允许的缩放宽度白名单。
 *
 * 必须白名单而不是接受任意数字：这个参数直接决定 sharp 的解码/编码开销，
 * 开放成任意值等于把 2 核服务器的 CPU 交给任何一个能构造 URL 的人。
 * 四个档位分别对应站点上的四类展示位置（见 lib/utils.ts 的 imgUrl 调用点）：
 *   128 = 订单/结算页 32~48px 的小图标
 *   240 = 购物车、后台列表 64px 缩略图
 *   400 = 首页/分类页商品卡片
 *   800 = 商品详情主图、轮播 banner（全屏宽）
 */
const ALLOWED_WIDTHS = [128, 240, 400, 800]

const RESIZABLE_EXTS = ['jpg', 'jpeg', 'png', 'webp']

/**
 * 并发闸门。
 *
 * sharp 解一张 4000×3000 的原图峰值要占约 36MB 内存，2 核 2G 的机器上
 * 首页十几张图同时冷启动会把 Node 进程直接顶到 OOM。
 * 这里把同时在跑的缩放任务压到 3 个，超出的排队——代价只是首屏多等几百毫秒，
 * 换来的是进程不会被一次访问打挂。
 */
const MAX_CONCURRENT = 3
let running = 0
const waiting: (() => void)[] = []

async function acquire(): Promise<void> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => waiting.push(resolve))
  }
  running++
}

function release(): void {
  running--
  waiting.shift()?.()
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

const CACHE_HEADERS = {
  // 缓存 30 天，提升加载速度
  'Cache-Control': 'public, max-age=2592000, immutable',
}

/**
 * 缩放并落盘缓存。缓存已存在则直接返回，不重复解码。
 *
 * 缓存放在跟图片同一个持久化卷（线上是 ./data/uploads/.cache），
 * 容器重建、重新部署都不会丢，同一张图只压一次。
 */
async function renderResized(src: Buffer, ext: string, width: number, cachePath: string): Promise<Buffer> {
  await acquire()
  try {
    // 进闸门后再查一次缓存：首页十几张图并发进来时，第一个生成完，
    // 后面排队的直接读结果，不必重复解码同一张原图
    try {
      return await readFile(cachePath)
    } catch {
      // 仍未命中，本轮生成
    }

    // failOn:'none' —— 手机上传的图偶有截断，不该因为一点点损坏就整张 500
    const pipeline = sharp(src, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })

    if (ext === 'png') pipeline.png({ compressionLevel: 9 })
    else if (ext === 'webp') pipeline.webp({ quality: 80 })
    else pipeline.jpeg({ quality: 80, progressive: true, mozjpeg: true })

    const buf = await pipeline.toBuffer()
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(cachePath, buf)
    return buf
  } finally {
    release()
  }
}

function send(file: Buffer, contentType: string) {
  // 拷成普通 Uint8Array 再交给 NextResponse：不同版本的 @types/node 里 Buffer 的
  // 泛型参数（ArrayBufferLike / ArrayBuffer）跟 BodyInit 对不上，直接传会在
  // next build 的类型检查阶段报错。多一次 memcpy 换类型干净，这点开销可以忽略。
  return new NextResponse(new Uint8Array(file), {
    headers: { 'Content-Type': contentType, ...CACHE_HEADERS },
  })
}

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const { name } = params

    // 安全检查：防止目录穿越攻击（如 ../../etc/passwd）
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // 上传目录优先读环境变量（部署时指向持久化卷），本地开发回退到项目内 uploads/
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
    const filePath = path.join(uploadDir, name)

    const ext = name.split('.').pop()?.toLowerCase() || ''
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    const widthParam = new URL(request.url).searchParams.get('w')
    const width = Number(widthParam)

    // 不带 ?w=、宽度不在白名单、或是不该重编码的格式（gif 动图 sharp 只取第一帧）：
    // 原样吐出磁盘上的文件——不带参数时行为与改造前完全一致，老链接不会失效
    const canResize =
      !!widthParam && ALLOWED_WIDTHS.includes(width) && RESIZABLE_EXTS.includes(ext)

    if (!canResize) {
      return send(await readFile(filePath), contentType)
    }

    // 缓存文件名带 "__w{宽度}" 后缀，与真实上传文件名（时间戳-随机串）不可能撞车
    const baseName = name.slice(0, -(ext.length + 1))
    const cachePath = path.join(uploadDir, '.cache', `${baseName}__w${width}.${ext}`)

    try {
      return send(await readFile(cachePath), contentType)
    } catch {
      // 缓存未命中，读取原图后生成
    }

    return send(await renderResized(await readFile(filePath), ext, width, cachePath), contentType)
  } catch (error) {
    console.error('Serve upload error:', error)
    return new NextResponse('Not Found', { status: 404 })
  }
}
