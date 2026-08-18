#!/bin/bash
# 甜蜜烘焙 阿里云轻量服务器一键部署脚本
# 在服务器上以 root 身份运行（或 sudo bash deploy.sh）
set -e

APP_DIR="${APP_DIR:-/root/honey-bake-web}"
GIT_URL="${GIT_URL:-https://github.com/alnachiu/honey-bake-web.git}"

echo "=========================================="
echo " 🍰 甜蜜烘焙 一键部署"
echo " 代码目录: $APP_DIR"
echo " 数据目录: $APP_DIR/data  （备份/迁移时复制这个目录即可）"
echo "=========================================="

# 1. 安装 Docker（若已安装则跳过）
if ! command -v docker >/dev/null 2>&1; then
  echo ""
  echo "[1/4] 安装 Docker ..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[1/4] Docker 已安装，跳过"
fi

# 2. 拉取/更新代码
if [ -d "$APP_DIR/.git" ]; then
  echo "[2/4] 更新代码（git pull）..."
  cd "$APP_DIR"
  git pull --ff-only
else
  echo "[2/4] 首次部署，克隆代码..."
  git clone "$GIT_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 3. 构建镜像（首次构建约 3-5 分钟，需服务器能访问 npm 源）
echo "[3/4] 构建 Docker 镜像..."
docker compose build

# 4. 启动/更新容器
echo "[4/4] 启动服务..."
docker compose up -d

echo ""
echo "=========================================="
echo " ✅ 部署完成！"
echo ""
echo " 访问地址: http://你的公网IP:3000"
echo " 公网 IP 请到阿里云控制台「轻量应用服务器」页面查看"
echo ""
echo " 管理员: admin@honeybake.com / admin123"
echo " 测试用户: user@test.com / user123"
echo ""
echo " 常用命令："
echo "   查看日志:  docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo "   重启服务:  docker compose -f $APP_DIR/docker-compose.yml restart"
echo "=========================================="
