#!/bin/bash
# 绑定自定义域名 + 自动 HTTPS 证书（香港区免备案服务器适用）
#
# 前提：
#  1. 你的域名已经添加 A 记录：honey-bake.lee.com -> 服务器公网IP
#     （在域名注册商 / DNS 服务商那里操作，DNS 生效一般几分钟到几小时）
#  2. 阿里云控制台防火墙已放行 TCP 80 和 443
#  3. 网站容器已在 3000 端口运行
#
# 用法：bash setup-domain.sh 你的完整域名
# 例如：bash setup-domain.sh honey-bake.lee.com
set -e

DOMAIN="${1:?用法: bash setup-domain.sh 你的完整域名}"
IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "请在阿里云控制台查看公网IP")

echo "=========================================="
echo " 🍰 域名绑定：${DOMAIN}"
echo " 服务器公网 IP：${IP}"
echo "=========================================="
echo ""
echo "⚠️  请先确认：${DOMAIN} 的 A 记录已经指向 ${IP}"
echo "（到你的域名服务商 DNS 管理里添加 A 记录；确定后继续）"
echo ""
read -r -p "已确认，按回车继续... " _dummy

echo "[1/4] 安装 nginx 和 certbot ..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

echo "[2/4] 配置反向代理 ..."
cat > /etc/nginx/sites-available/honey-bake <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # 允许上传大图（原项目图片上限 5MB，留余量到 10M）
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/honey-bake /etc/nginx/sites-enabled/honey-bake
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

echo "[3/4] 申请免费 HTTPS 证书 (Let's Encrypt) ..."
certbot --nginx -d "${DOMAIN}" --redirect --non-interactive --agree-tos --register-unsafely-without-email

echo "[4/4] 完成，最后加载一次配置 ..."
systemctl reload nginx

echo ""
echo "=========================================="
echo " ✅ 域名绑定成功！"
echo ""
echo " 访问: https://${DOMAIN}"
echo " (HTTP 会自动跳转到 HTTPS，原 http://IP:3000 仍可用)"
echo ""
echo " 以后续期证书（Let's Encrypt 90 天有效）会自动运行，无需手动处理"
echo "=========================================="
