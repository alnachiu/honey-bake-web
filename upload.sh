#!/bin/bash
# 本地上传工具：把项目源码打包上传到服务器，不经过 GitHub
# 用法（在本机 Git Bash 里运行）：
#   bash upload.sh 你的公网IP
#
# 说明：
#  - 自动排除 node_modules/.next/.git/uploads/data 等大目录/数据目录
#  - data/ 不上传 = 服务器上已有的数据库和图片不会被覆盖
#  - 上传前请先本地 git commit（工具打包的是已提交的代码）
set -e

IP="${1:?用法: bash upload.sh 你的公网IP}"
cd "$(dirname "$0")"

echo "📦 打包源码（只包含已提交的文件）..."
git archive --format=tar.gz -o /tmp/honey-bake-web.tar.gz HEAD

echo "⬆️  上传到 root@${IP} ...（会提示输入 root 密码）"
scp /tmp/honey-bake-web.tar.gz "root@${IP}:/root/"

echo ""
echo "✅ 上传完成！接下来在服务器上执行："
echo ""
echo "  cd /root/honey-bake-web && tar -xzf /root/honey-bake-web.tar.gz && docker compose up -d --build"
echo ""
