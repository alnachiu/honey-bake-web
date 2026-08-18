#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"
DB_DIR="${DATA_DIR}/prisma"
DB_FILE="${DB_DIR}/dev.db"

echo "📁 数据目录: ${DATA_DIR}"

# 1. 创建持久化目录（对应挂载在 /app/data 的卷，图片和数据库都放这里）
mkdir -p "$UPLOAD_DIR" "$DB_DIR"

# 2. 记录是否首次启动（首次才写入种子数据，避免重复）
FIRST_BOOT=0
[ -f "$DB_FILE" ] || FIRST_BOOT=1

# 3. 数据库 URL：未显式配置时指向持久化卷
export DATABASE_URL="${DATABASE_URL:-file:${DB_FILE}}"
export UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"

# 4. 同步表结构（幂等，可重复执行）
echo "🗄️  同步数据库表结构..."
npx prisma db push --skip-generate

# 5. 首次启动时写入初始数据（管理员 / 示例商品 / 优惠券）
if [ "$FIRST_BOOT" = "1" ]; then
  echo "🆕 首次启动，写入初始数据..."
  npm run db:seed
fi

echo "🚀 启动服务 (端口 ${PORT:-3000})..."
exec npm start
