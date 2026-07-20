# 🚀 Vercel 部署指南

## 方式一：一键部署（推荐）

1. 点击下方按钮将项目推送到你的 GitHub：

```bash
# 在项目目录执行
git init
git add .
git commit -m "初始化甜蜜烘焙"
# 在 GitHub 创建仓库后
git remote add origin https://github.com/你的用户名/honey-bake-web.git
git push -u origin main
```

2. 访问 [Vercel](https://vercel.com) 并导入该 GitHub 仓库
3. 在 Vercel 项目设置中配置环境变量

## 方式二：Vercel CLI

```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 部署
vercel
```

## 数据库配置

### 方案 A：Vercel Postgres（推荐，免费）
1. 在 Vercel Dashboard 中创建 Postgres 数据库
2. 复制连接字符串
3. 修改 `prisma/schema.prisma` 中的 datasource 为：
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. 在 Vercel 项目设置中添加环境变量 `DATABASE_URL`

### 方案 B：Neon（免费 Postgres）
1. 注册 [Neon](https://neon.tech)
2. 创建项目，获取连接字符串
3. 在 Vercel 环境变量中添加 `DATABASE_URL`

### 方案 C：MongoDB Atlas（免费）
1. 注册 [MongoDB Atlas](https://www.mongodb.com/atlas)
2. 创建免费集群
3. 修改 Prisma schema 的 provider 为 "mongodb"

## 初始化数据

部署后访问:
```
https://你的域名/api/seed
```
自动创建管理员账号和示例数据。

## 本地开发

```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma db push
npm run db:seed

# 启动开发服务器
npm run dev
```

## 默认账号

- 管理员: admin@honeybake.com / admin123
- 用户: user@test.com / user123
