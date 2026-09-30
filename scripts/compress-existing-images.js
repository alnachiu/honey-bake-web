#!/usr/bin/env node
/*
 * 存量图片瘦身（一次性回填脚本）。
 *
 * 背景：线上 44 张商品图合计约 105MB，平均 2.4MB，而列表页只按 200px 显示。
 * 上传接口已经改成入库前压缩（src/app/api/upload/route.ts），但**已经躺在
 * 服务器上的老图不会自己变小**——这个脚本就是补这一刀。
 *
 * 用法：
 *   node scripts/compress-existing-images.js              # 处理长边 > 1600 的图
 *   node scripts/compress-existing-images.js --all        # 连同小图一起重压
 *   node scripts/compress-existing-images.js --backup     # 覆盖前把原图挪到 data/backup-originals/
 *   node scripts/compress-existing-images.js --dry-run    # 只看会改成什么样，不落盘
 *
 * ⚠️ 默认**不留备份、直接覆盖**，压缩后无法还原成原图。在服务器上正式跑之前，
 *    建议先 `--dry-run` 看一遍，或者加 `--backup`。
 *
 * 目录取 UPLOAD_DIR（线上是持久化卷），没设就退回项目内的 uploads/。
 * 跑完会顺手清掉 uploads/.cache/ —— 缩略图缓存是按旧原图生成的，
 * 原图变了不清理的话，前台拿到的还是旧的。
 */

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const sharp = require('sharp')

/**
 * ⚠️ 下面这组参数必须与 src/app/api/upload/route.ts 保持一致。
 * 不一致的话，回填出来的老图和之后新上传的图会是两个尺寸口径
 * （比如老图 1600、新图 2000），前台看起来就是「有些图糊一些」，
 * 而且很难查。改上传路由的压缩参数时，记得同步改这里。
 */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 82
const WEBP_QUALITY = 82
const PNG_COMPRESSION = 9

const RESIZABLE_EXTS = ['jpg', 'jpeg', 'png', 'webp']

const args = process.argv.slice(2)
const opts = {
  all: args.includes('--all'),
  backup: args.includes('--backup'),
  dryRun: args.includes('--dry-run'),
  keepCache: args.includes('--keep-cache')
}

const dirArg = args.find(a => a.startsWith('--dir='))
const UPLOAD_DIR = dirArg
  ? path.resolve(dirArg.slice('--dir='.length))
  : (process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'))

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backup-originals')
const CACHE_DIR = path.join(UPLOAD_DIR, '.cache')

const fmt = bytes => `${(bytes / 1024 / 1024).toFixed(2)}MB`

let totalBefore = 0
let totalAfter = 0
let converted = 0
let skippedSmall = 0
let skippedNoGain = 0
const stillBig = []

async function processFile(file) {
  const ext = path.extname(file).slice(1).toLowerCase()
  if (!RESIZABLE_EXTS.includes(ext)) return

  const original = await fsp.readFile(file)
  const meta = await sharp(original, { failOn: 'none' }).metadata()
  const longSide = Math.max(meta.width || 0, meta.height || 0)

  if (longSide <= MAX_DIMENSION && !opts.all) {
    skippedSmall++
    return
  }

  // 与上传路由逐字一致的处理链：按 EXIF 摆正 → 长边夹到 1600（withoutEnlargement
  // 让小图原样通过，所以这里不需要为「小图」另写一条分支）
  const pipeline = sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })

  if (ext === 'png') pipeline.png({ compressionLevel: PNG_COMPRESSION })
  else if (ext === 'webp') pipeline.webp({ quality: WEBP_QUALITY })
  else pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })

  let output
  try {
    output = await pipeline.toBuffer()
  } catch (error) {
    // 单张失败不该中断整批：手机上传的图偶有截断，跳过它继续处理剩下的
    console.log(`  ⚠️  跳过（编码失败）：${path.basename(file)} — ${error.message}`)
    return
  }

  // 只有确实更小才替换。已经优化过的图重压一次反而可能变大（重新编码的
  // 熵编码开销 + 元数据），那种情况原样留着才是对的。
  if (output.length >= original.length) {
    skippedNoGain++
    return
  }

  totalBefore += original.length
  totalAfter += output.length
  converted++

  const ratio = ((1 - output.length / original.length) * 100).toFixed(0)
  console.log(`  ${path.basename(file)}  ${fmt(original.length)} → ${fmt(output.length)}  (-${ratio}%)${longSide > MAX_DIMENSION ? `  ${longSide}px → ${MAX_DIMENSION}px` : ''}`)

  if (opts.dryRun) return

  if (opts.backup) {
    await fsp.mkdir(BACKUP_DIR, { recursive: true })
    await fsp.copyFile(file, path.join(BACKUP_DIR, path.basename(file)))
  }

  // 先写临时文件再 rename：线上容器正跑着，直接 writeFile 会先截断原文件，
  // 恰好在这几百毫秒里被访问到的话会吐出一张半截的图。
  // 同一文件系统内 rename 是原子的，读方要么看到旧图要么看到新图。
  const tmp = `${file}.tmp-${process.pid}`
  await fsp.writeFile(tmp, output)
  await fsp.rename(tmp, file)
}

/** 清掉缩略图缓存。原图变了，旧缓存必须一并清掉，否则前台拿到的还是按旧原图生成的缩略图 */
async function clearCache() {
  let removed = 0
  try {
    const entries = await fsp.readdir(CACHE_DIR)
    for (const name of entries) {
      await fsp.rm(path.join(CACHE_DIR, name), { force: true })
      removed++
    }
  } catch {
    // 目录不存在 = 还没人生成过缩略图，无需处理
  }
  return removed
}

async function main() {
  console.log('=== 存量图片压缩 ===')
  console.log(`目录：${UPLOAD_DIR}`)
  console.log(`模式：${opts.dryRun ? '试运行（不落盘）' : '正式执行'}${opts.all ? ' · 含小图' : ' · 仅长边 > ' + MAX_DIMENSION + 'px'}${opts.backup ? ' · 保留备份' : ''}\n`)

  let files
  try {
    files = await fsp.readdir(UPLOAD_DIR)
  } catch {
    console.log(`❌ 目录不存在：${UPLOAD_DIR}`)
    process.exit(1)
  }

  // .cache 里放的是缩略图，不是原图；备份目录若被塞进上传目录也要跳过，
  // 否则备份会被当成原图再压一遍
  const targets = files
    .filter(n => !n.startsWith('.'))
    .filter(n => RESIZABLE_EXTS.includes(path.extname(n).slice(1).toLowerCase()))
    .map(n => path.join(UPLOAD_DIR, n))

  if (!targets.length) {
    console.log('目录里没有可处理的图片')
    return
  }

  for (const file of targets) {
    await processFile(file)
  }

  console.log(`\n处理 ${converted} 张：${fmt(totalBefore)} → ${fmt(totalAfter)}` +
    (totalBefore > 0 ? `（省下 ${fmt(totalBefore - totalAfter)}，${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%）` : ''))
  if (skippedSmall) console.log(`长边未超 ${MAX_DIMENSION}px 而跳过：${skippedSmall} 张（想一起压就加 --all）`)
  if (skippedNoGain) console.log(`压缩后没变小而保留原样：${skippedNoGain} 张`)

  if (opts.dryRun) {
    console.log('\n试运行结束，未改动任何文件。')
    return
  }

  if (converted > 0 && !opts.keepCache) {
    const removed = await clearCache()
    console.log(`已清空缩略图缓存：${removed} 个文件`)
  }

  if (opts.backup) console.log(`原图备份在：${BACKUP_DIR}`)
  else if (converted > 0) console.log('⚠️  未保留原图备份，压缩不可逆。')
}

main().catch(err => {
  console.error('执行失败：', err)
  process.exit(1)
})
