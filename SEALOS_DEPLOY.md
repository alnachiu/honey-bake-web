# 🚀 Sealos 部署指南（免费、国内可访问、无需备案）

本项目已内置 `Dockerfile` + `entrypoint.sh` + `.dockerignore`，专门适配 Sealos。
核心思路：**数据库（SQLite）和上传的图片都存放在持久化卷 `/app/data` 上**，
这样无论怎么重新部署、重启，数据都不会丢。

> 为什么之前 Railway 会挂：Railway 失效 + 国外访问不稳。
> 为什么不用 Vercel：Vercel 没有持久磁盘，本项目图片和数据库存在本地文件，一重新部署就丢。

---

## 一、前提：把代码推到 GitHub

Sealos 会直接从你的 GitHub 仓库构建镜像，所以先同步代码：

```bash
cd "d:\桌面\first job\HONEY-BAKE-WEB"
git add .
git commit -m "feat: 适配 Sealos 部署（持久化卷 + Dockerfile）"
git push origin main
```

## 二、在 Sealos 上部署

1. 打开 https://cloud.sealos.io ，用手机号/邮箱注册（新用户有免费额度）。

2. **构建镜像**：
   - 进入「镜像」→「构建镜像」→「导入」→ 选择 GitHub 仓库 `alnachiu/honey-bake-web`；
   - 选择仓库默认分支 `main`，构建方式选 **Dockerfile**（仓库根目录已有）；
   - 开始构建，等待构建日志跑完（首次构建约 3-5 分钟）。

3. **创建应用（容器）**：
   - 「我的应用」→「创建应用」，镜像填上一步构建好的镜像（如 `docker.io/xxxx/honey-bake-web:latest`）。
   - 资源：**1C 1G** 即可，存储选小容量（如 **1G**）。

4. **关键：挂载持久化卷**（否则图片和数据会丢）：
   - 在应用的「存储/卷」里添加一个**持久卷**，挂载路径填 `/app/data`。
   - ⚠️ 挂载路径必须是 `/app/data`，数据库和图片都在这个目录下。

5. **环境变量**（可选，`Dockerfile` 里已有默认值）：
   | 变量 | 默认值 | 说明 |
   |---|---|---|
   | `DATABASE_URL` | `file:/app/data/prisma/dev.db` | 数据库位置，一般不用改 |
   | `UPLOAD_DIR` | `/app/data/uploads` | 上传图片目录，一般不用改 |
   | `JWT_SECRET` | 内置默认 | 建议改成你自己的强随机字符串 |
   | `PORT` | `3000` | 容器端口 |

6. **暴露端口**：容器端口填 `3000`，保存后 Sealos 会分配一个公网地址
   （形如 `https://xxxx.sealos.app`），**自带 HTTPS、无需备案**，国内可正常访问。

7. **启动**：应用首次启动会自动执行「建表 + 写入初始数据」，
   看到日志出现 `🚀 启动服务` 即成功。

## 三、登录 & 使用

浏览器打开分配的地址：

- 后台管理：`https://你的地址/admin`
- 管理员：`admin@honeybake.com` / `admin123`
- 测试用户：`user@test.com` / `user123`

> 安全提醒：上线后请立即改掉默认密码，并把 `JWT_SECRET` 换成自己的随机串。

## 四、常见问题

- **重新部署后图片/数据还在吗？** 在——只要卷挂载在 `/app/data`，图片和数据库都在卷上。
- **数据想备份？** Sealos 卷支持快照，也可以在管理后台把 `/app/data/prisma/dev.db` 下载下来。
- **想用自己的域名？** 若服务器在国内需先做 ICP 备案；不备案就继续用 Sealos 分配的域名即可。
- **免费额度用完？** 小站 1C1G 用量极低，超出后按量计费，一般每月几块钱；也可以升级配置。
- **想本地先跑一遍？** 见下方「本地验证」。

## 五、本地验证（可选，有 Docker 时）

```bash
docker build -t honey-bake-web .
docker run -p 3000:3000 -v honey-data:/app/data honey-bake-web
# 访问 http://localhost:3000
```

## 六、本地开发（无容器）

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```
数据库仍用项目内 `prisma/dev.db`，上传图片存 `uploads/`，与部署互不影响。
