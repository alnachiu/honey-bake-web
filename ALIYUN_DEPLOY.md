# 🚀 阿里云轻量应用服务器 部署指南（国内稳定访问）

本项目已内置 `Dockerfile` + `docker-compose.yml` + `deploy.sh`，
在阿里云轻量服务器上**一条命令即可部署**。

**数据如何持久化**：数据库（SQLite）和上传图片都存在服务器磁盘的
`/root/honey-bake-web/data/` 目录里（compose 把它挂载到容器 `/app/data`）。
重装容器、重启、重新构建都不会丢数据，**备份就是复制这一个目录**。

---

## 一、购买轻量服务器（关键选择）

| 区 域 | 免备案 | 大陆访问速度 | 月费（约） | 能不能用域名 |
|---|---|---|---|---|
| **香港区**（推荐） | ✅ 免备案 | 快（30-80ms） | ¥30-50 | 可以直接绑域名 + HTTPS |
| 大陆区 | ❌ 要备案 | 最快 | ¥50-100 | 需 ICP 备案才能用域名；不备案只能用 IP:端口 |

**建议**：想省事、马上能用 → 选**香港区**。想追求极致稳定、有备案意愿 → 选大陆区。

- 规格选 **2核 2G** 以上（1G 内存跑 `next build` 容易内存不足），硬盘 40G 起。
- 系统镜像选 **Ubuntu 22.04** 或 **Debian 12**（后续装 Docker 最顺畅）。

## 二、开通防火墙端口

阿里云轻量控制台 →「防火墙」→ 放行 TCP **3000**。
（如果以后加了域名/HTTPS，再放行 80 和 443。）

## 三、SSH 登录服务器

用你的终端或 XShell 连接：

```bash
ssh root@你的公网IP
```

首次登录会让你设置 root 密码（控制台里也可以重置密码 / 绑定密钥）。

## 四、推送代码到 GitHub（前提）

服务器是从 GitHub 克隆代码的，先同步本地改动：

```bash
cd "d:\桌面\first job\HONEY-BAKE-WEB"
git add .
git commit -m "feat: 适配阿里云/Sealos 部署（持久化 + Dockerfile）"
git push origin main
```

## 五、一键部署（在服务器上执行）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/alnachiu/honey-bake-web/main/deploy.sh)
```

脚本会自动：装 Docker → 克隆代码 → 构建镜像 → 启动容器（首次构建 3-5 分钟）。

完成后打开 `http://你的公网IP:3000`：

- 后台管理：`http://IP:3000/admin`
- 管理员：`admin@honeybake.com` / `admin123`
- 测试用户：`user@test.com` / `user123`

> 大陆区若拉取 Docker 镜像慢/失败，请先按阿里云文档配置「容器镜像加速器」再重跑。

## 六、可选：绑定自己的域名 + HTTPS（推荐）

### 香港区（免备案）
1. 域名解析 A 记录指向服务器公网 IP；
2. 服务器上装 nginx 做反向代理到 3000，并用 certbot 申请免费 HTTPS 证书：
   ```bash
   apt update && apt install -y nginx certbot python3-certbot-nginx
   certbot --nginx -d 你的域名
   ```
3. 阿里云防火墙放行 80 / 443。

### 大陆区
1. 先在阿里云做 **ICP 备案**（免费，审核约 2-3 周）；
2. 备案通过后再解析域名、按上面同样步骤配 HTTPS。

## 七、数据备份 & 迁移

- **备份**：把服务器上的 `/root/honey-bake-web/data/` 整个目录下载下来即可
  （里面是 `prisma/dev.db` 数据库 + `uploads/` 图片）。
  ```bash
  tar -czf honey-data.tar.gz /root/honey-bake-web/data
  ```
- **迁移**：新服务器装好后，把 `data/` 目录放到 `/root/honey-bake-web/data/`
  再执行部署脚本即可，数据完整保留。

## 八、日常维护

```bash
# 查看日志（Ctrl+C 退出）
docker compose -f /root/honey-bake-web/docker-compose.yml logs -f

# 重启服务
docker compose -f /root/honey-bake-web/docker-compose.yml restart

# 更新到最新代码
cd /root/honey-bake-web && git pull && docker compose up -d --build

# 停止服务
docker compose -f /root/honey-bake-web/docker-compose.yml down
```

## 九、安全提醒（务必做）

1. 上线后**立刻改管理员密码**（admin 账号登录后台即可改）；
2. 把 `docker-compose.yml` 里的 `JWT_SECRET` 改成强随机串：
   ```bash
   openssl rand -hex 32
   ```
   改完后执行 `docker compose up -d` 重启；
3. 服务器开启 SSH 密钥登录，关闭密码登录；
4. 阿里云防火墙只放开必要的端口（3000/80/443/22），其他全关；
5. 建议开启阿里云轻量的「快照」功能，出问题一键回滚。

## 十、本地开发不受影响

本地仍用 `prisma/dev.db` + `uploads/` 目录，`npm run dev` 照常，与线上互不影响。
