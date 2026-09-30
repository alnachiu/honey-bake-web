/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '**' }
    ]
  },
  // 这里原本有个 env 块，把 JWT_SECRET 连同硬编码兜底一起声明出来。
  // 那个写法会让 Next.js 在**构建期**把密钥字面量内联进产物（.next/server/**/*.js），
  // 后果是：① 换服务器上的 .env 完全不生效，密钥轮换变成空转；
  // ② 构建产物本身就是密钥副本，镜像/构建缓存泄漏 = 密钥泄漏。
  // 服务端代码读 process.env.JWT_SECRET 本来就是运行时求值，删掉这个块即可，
  // 不需要任何替代写法。详见 src/lib/auth.ts 的 getJwtSecret()。
}

module.exports = nextConfig
