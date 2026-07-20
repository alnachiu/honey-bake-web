/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '**' }
    ]
  },
  env: {
    JWT_SECRET: process.env.JWT_SECRET || 'honey-bake-jwt-secret-key-2026'
  }
}

module.exports = nextConfig
