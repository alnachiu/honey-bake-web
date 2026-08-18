# 甜蜜烘焙 Honey Bake —— 通用部署镜像（Sealos / 任意云服务器）
# 单阶段构建：Next.js 14 生产模式 + Prisma/SQLite + 本地上传图片
FROM node:20-slim

WORKDIR /app

# Prisma 引擎运行时依赖 OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 构建阶段即可用的环境变量（prisma generate / next build 需要）
# 生产默认值指向持久化卷挂载点 /app/data，Sealos 上可覆盖
ENV DATABASE_URL=file:/app/data/prisma/dev.db
ENV UPLOAD_DIR=/app/data/uploads
ENV JWT_SECRET=honey-bake-jwt-secret-key-2026

# 复制项目（.dockerignore 已排除 node_modules/.next/uploads/本地数据库等）
COPY . .

# 安装依赖（postinstall 会自动执行 prisma generate）
RUN npm ci

# 构建（build 脚本 = prisma generate && next build）
RUN npm run build

# 运行阶段
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# 启动脚本：初始化持久化目录、同步表结构、首次写入种子数据后启动
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
# 处理 Windows 下可能产生的 CRLF 换行
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
  && chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
