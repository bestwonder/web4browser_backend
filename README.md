# web4browser 后台部署说明

本文档说明如何在正式 Linux 服务器上使用 Docker 部署当前项目，以及上线前需要修改哪些文件、哪些参数。

当前项目由三个 Docker 服务组成：

- `web`：Nginx 静态站点容器，提供 `website` 目录中的后台页面。
- `api`：Node.js 内部 API 服务，入口文件是 `services/internal-api-server/server.mjs`。
- `db`：PostgreSQL 数据库，用于持久化用户、订单、订阅、设备、审计等后台数据。

推荐正式环境结构：

```text
浏览器
  |
  | HTTPS: https://你的域名
  v
Linux 服务器宿主机 Nginx
  |
  | http://127.0.0.1:8080
  v
Docker web 容器
  |
  | http://api:3001
  v
Docker api 容器
  |
  | postgresql://db:5432
  v
Docker db 容器
```

## 生产推荐拓扑（console / api 双子域）

正式环境建议拆成两个子域名：

- `console.web4browser.io`：管理员后台专用
- `api.web4browser.io`：外部 API / relay 专用

推荐访问规则：

- `console.web4browser.io`
  - 暴露后台页面：`/admin*.html`、`/login.html`
  - 暴露后台接口：`/api/admin/*`
  - 暴露后台登录相关接口：`/api/auth/*`
  - 暴露健康检查：`/api/health`
  - 额外加一层 `Basic Auth`
- `api.web4browser.io`
  - 暴露外部接口：`/api/auth/*`、`/api/account/*`、`/api/device/*`、`/api/chat/*`、`/api/billing/*`、`/api/anthropic/*`
  - 直接拦截：`/api/admin/*`、`/api`、`/api/`
  - 不提供任何 `/admin*.html`

当前仓库已经补充了两份宿主机 Nginx 示例：

- `deploy/nginx/console.web4browser.io.conf`
- `deploy/nginx/api.web4browser.io.conf`

同时，服务端新增了这两个生产相关环境变量：

- `PUBLIC_RELAY_BASE_URL`：后台展示给用户/客户端的外部 API 根地址
- `ADMIN_ALLOWED_HOSTS`：允许访问 `/api/admin/*` 和 `/api` 的 Host 白名单

建议生产值：

```env
PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api
ADMIN_ALLOWED_HOSTS=console.web4browser.io
```

本地 Docker 调试时可以临时保留：

```env
ADMIN_ALLOWED_HOSTS=console.web4browser.io,127.0.0.1,localhost
```

## 一、正式环境上线前必须修改的文件

### 1. 修改 `services/internal-api-server/.env.docker`

这个文件是 Docker 启动 `api` 容器时读取的环境变量文件。正式环境不要直接使用默认测试账号和测试密码。

需要重点修改：

```env
PORT=3001
NODE_ENV=production
COOKIE_SECURE=1
ALLOW_MOCK=0

ADMIN_EMAILS=admin@example.com
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=请改成高强度密码

DATABASE_URL=postgresql://web4browser:请改成数据库强密码@db:5432/web4browser_admin?sslmode=disable

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://你的域名/auth/google/callback
PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api
ADMIN_ALLOWED_HOSTS=console.web4browser.io

DEFAULT_TRIAL_POINTS=600
DEFAULT_TRIAL_DAYS=3
LOW_BALANCE_THRESHOLD=200

CHAT_COST_PER_MESSAGE=20
TOKENS_PER_POINT=120
INPUT_COST_PER_1K_TOKENS=0
OUTPUT_COST_PER_1K_TOKENS=0

MINIMAX_API_KEY=你的上游模型 API Key
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
LAOLV_UPSTREAM_MODEL=MiniMax-M2.7
LAOLV_MODEL_DISPLAY_NAME=web4browser AI

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SES_FROM_EMAIL=noreply@example.com
```

字段说明：

- `COOKIE_SECURE=1`：正式 HTTPS 环境必须开启。浏览器只会在 HTTPS 下保存带 `Secure` 的登录 Cookie。
- `ALLOW_MOCK=0`：正式环境建议关闭 mock 行为，避免上游模型、登录等配置缺失时仍然走演示逻辑。
- `ADMIN_EMAILS`：允许访问后台的管理员邮箱，多个邮箱用英文逗号分隔。
- `BOOTSTRAP_ADMIN_EMAIL`：系统启动时自动创建或更新的管理员账号邮箱。
- `BOOTSTRAP_ADMIN_PASSWORD`：自动创建管理员账号时使用的密码。必须改成强密码。
- `DATABASE_URL`：API 连接 PostgreSQL 的地址，密码必须和 `docker-compose.yml` 中的 `POSTGRES_PASSWORD` 保持一致。
- `GOOGLE_REDIRECT_URI`：如果启用 Google 登录，必须改成正式域名。
- `PUBLIC_RELAY_BASE_URL`：后台展示给用户、客户端或桌面端的外部 API 基地址。双子域部署时应指向 `https://api.web4browser.io/api`。
- `ADMIN_ALLOWED_HOSTS`：应用层允许访问管理员接口的 Host 白名单。生产环境应收紧为 `console.web4browser.io`。
- `MINIMAX_API_KEY`：如果聊天/中转功能需要真实调用上游模型，必须填写。
- `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`SES_FROM_EMAIL`：如果需要邮件验证码或通知邮件，填写 AWS SES 参数。

如果正式环境暂时没有 HTTPS，只是临时内网测试，可以把 `COOKIE_SECURE=0`，但不建议公网这样部署。

### 2. 修改 `docker-compose.yml`

正式环境必须修改数据库密码，并建议只把 Docker 的 web 服务绑定到本机 `127.0.0.1:8080`，再由宿主机 Nginx 对外提供 HTTPS。

推荐修改后的关键内容：

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: web4browser-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: web4browser_admin
      POSTGRES_USER: web4browser
      POSTGRES_PASSWORD: 请改成数据库强密码
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - web4browser_net

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: web4browser-api
    restart: unless-stopped
    env_file:
      - ./services/internal-api-server/.env.docker
    depends_on:
      - db
    volumes:
      - api_data:/app/data
    networks:
      - web4browser_net

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: web4browser-web
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - web4browser_net
```

注意：

- `POSTGRES_PASSWORD` 必须改成强密码。
- `.env.docker` 中的 `DATABASE_URL` 密码必须和这里一致。
- 推荐使用 `"127.0.0.1:8080:80"`，这样 Docker web 容器不会直接暴露到公网。
- 如果你不使用宿主机 Nginx，想让 Docker 直接监听 80 端口，可以改成 `"80:80"`，但这样需要另外处理 HTTPS，不推荐裸 HTTP 上线。

### 3. 一般不需要修改 `nginx.conf`

项目根目录的 `nginx.conf` 是 Docker 内部 `web` 容器使用的配置。

它的作用：

- 静态页面从 `/usr/share/nginx/html` 提供。
- `/api/` 反向代理到 Docker 内部的 `api:3001`。
- 根路径 `/` 默认落到后台入口 `admin.html`。

正式环境通常不用改这个文件。域名、HTTPS、证书、gzip、安全响应头等建议放在宿主机 Nginx 中处理。

如果你采用 `console.web4browser.io` / `api.web4browser.io` 双子域部署，请优先使用仓库里新增的宿主机 Nginx 示例：

- `deploy/nginx/console.web4browser.io.conf`
- `deploy/nginx/api.web4browser.io.conf`

### 4. 不要把 `.env.example` 当作 Docker 正式配置

`services/internal-api-server/.env.example` 只是参数示例，本项目 Docker 启动实际读取的是：

```text
services/internal-api-server/.env.docker
```

如果你手动用 Node.js 裸启动 API，可以复制 `.env.example` 为 `.env` 后再自行加载。但当前 Docker 部署流程不会自动读取 `.env`。

## 二、Linux 服务器准备

以下以 Ubuntu 22.04 / 24.04 为例。

### 1. 安装基础工具

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git nginx ufw
```

### 2. 安装 Docker Engine

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

验证：

```bash
docker --version
docker compose version
```

如果希望当前用户直接运行 Docker：

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 三、上传或拉取项目代码

任选一种方式。

方式 A：服务器直接拉 Git 仓库：

```bash
cd /opt
sudo git clone 你的仓库地址 web4browser
sudo chown -R $USER:$USER /opt/web4browser
cd /opt/web4browser
```

方式 B：从本地打包上传：

```bash
cd /opt
sudo mkdir -p /opt/web4browser
sudo chown -R $USER:$USER /opt/web4browser
```

然后用 `scp`、`rsync`、SFTP 或面板上传项目文件到：

```text
/opt/web4browser
```

进入项目目录：

```bash
cd /opt/web4browser
```

## 四、配置正式环境参数

### 1. 修改数据库密码

编辑：

```bash
nano docker-compose.yml
```

找到：

```yaml
POSTGRES_PASSWORD: web4browser_dev_password
```

改成强密码，例如：

```yaml
POSTGRES_PASSWORD: 你的数据库强密码
```

再找到 `web` 服务端口：

```yaml
ports:
  - "8080:80"
```

推荐改成：

```yaml
ports:
  - "127.0.0.1:8080:80"
```

### 2. 修改 API 环境变量

编辑：

```bash
nano services/internal-api-server/.env.docker
```

至少修改这些字段：

```env
COOKIE_SECURE=1
ALLOW_MOCK=0
ADMIN_EMAILS=你的管理员邮箱
BOOTSTRAP_ADMIN_EMAIL=你的管理员邮箱
BOOTSTRAP_ADMIN_PASSWORD=你的管理员强密码
DATABASE_URL=postgresql://web4browser:你的数据库强密码@db:5432/web4browser_admin?sslmode=disable
GOOGLE_REDIRECT_URI=https://你的域名/auth/google/callback
PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api
ADMIN_ALLOWED_HOSTS=console.web4browser.io
MINIMAX_API_KEY=你的上游模型 API Key
```

如果你暂时不启用 Google 登录，可以先留空：

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

如果你暂时不启用邮件，可以先留空：

```env
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

但正式公网环境不建议长期依赖空配置或 mock 行为。

## 五、启动 Docker 服务

在项目根目录执行：

```bash
cd /opt/web4browser
docker compose config
```

确认配置没有报错后构建并启动：

```bash
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
```

本机测试：

```bash
curl -i http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/
```

预期：

- `/api/health` 返回 `200`。
- `/api/` 未登录返回 `401`。
- 后台页面未登录会跳转到 `/login.html`。

## 六、配置宿主机 Nginx 和 HTTPS

推荐让宿主机 Nginx 对外监听 80/443，再反向代理到 Docker web 容器的 `127.0.0.1:8080`。

### 1. 新建 Nginx 站点配置

把 `你的域名` 替换成真实域名：

```bash
sudo nano /etc/nginx/sites-available/web4browser.conf
```

写入：

```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/web4browser.conf /etc/nginx/sites-enabled/web4browser.conf
sudo nginx -t
sudo systemctl reload nginx
```

如果采用双子域部署，建议不要再手写单域配置，而是直接使用：

- `deploy/nginx/console.web4browser.io.conf`
- `deploy/nginx/api.web4browser.io.conf`

并将其中的：

- `server_name`
- `auth_basic_user_file`
- 上游地址

替换成你的正式值。

生成 Basic Auth 密码文件示例：

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-web4browser-console your-admin-gateway-user
```

这样访问 `console.web4browser.io` 时，会先弹一层 Nginx Basic Auth，再进入项目自己的后台登录流程。

### 2. 配置域名 DNS

在域名服务商处添加 A 记录：

```text
主机记录：@
记录类型：A
记录值：你的服务器公网 IP
```

如果使用 `www`：

```text
主机记录：www
记录类型：A
记录值：你的服务器公网 IP
```

等待 DNS 生效后再申请 HTTPS 证书。

### 3. 安装 Certbot 并申请证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

如果还有 `www`：

```bash
sudo certbot --nginx -d 你的域名 -d www.你的域名
```

验证自动续期：

```bash
sudo certbot renew --dry-run
```

证书完成后，正式环境 `.env.docker` 应保持：

```env
COOKIE_SECURE=1
PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api
ADMIN_ALLOWED_HOSTS=console.web4browser.io
```

## 七、防火墙配置

只开放 SSH、HTTP、HTTPS：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

如果 `docker-compose.yml` 使用了推荐的：

```yaml
ports:
  - "127.0.0.1:8080:80"
```

则外网不能直接访问 `8080`，只能通过宿主机 Nginx 访问。

## 八、首次登录后台

部署完成后访问：

```text
https://你的域名/login.html
```

使用 `.env.docker` 中配置的账号密码：

```text
账号：BOOTSTRAP_ADMIN_EMAIL
密码：BOOTSTRAP_ADMIN_PASSWORD
```

登录后可访问：

```text
https://你的域名/admin.html
```

当前后台鉴权规则：

- 未登录访问后台页面会跳转到 `/login.html`。
- 未登录访问 `/api/` 返回 `401`。
- 未登录访问 `/api/admin/*` 返回 `401`。
- 普通用户访问 `/api/` 或 `/api/admin/*` 返回 `403`。
- 管理员用户可以访问后台页面和后台接口。

## 九、更新部署

如果代码有更新：

```bash
cd /opt/web4browser
git pull
docker compose up -d --build
docker compose ps
```

如果不是 Git 部署，而是手动上传文件，则上传覆盖后执行：

```bash
cd /opt/web4browser
docker compose up -d --build
docker compose ps
```

## 十、备份和恢复

当前 Docker 使用两个持久化卷：

- `postgres_data`：PostgreSQL 数据。
- `api_data`：API 的 JSON 快照、辅助数据。

### 1. 数据库备份

```bash
cd /opt/web4browser
mkdir -p backups
docker compose exec -T db pg_dump -U web4browser -d web4browser_admin > backups/web4browser_admin_$(date +%F_%H%M%S).sql
```

### 2. 数据库恢复

先确认要恢复的 SQL 文件路径，例如：

```text
backups/web4browser_admin_2026-04-20_120000.sql
```

执行：

```bash
cd /opt/web4browser
cat backups/你的备份文件.sql | docker compose exec -T db psql -U web4browser -d web4browser_admin
```

### 3. 备份 Docker volume

先查看真实 volume 名称：

```bash
docker volume ls
```

如果 volume 名称是 `web4browser_postgres_data` 和 `web4browser_api_data`，可以这样备份：

```bash
cd /opt/web4browser
mkdir -p backups

docker run --rm \
  -v web4browser_postgres_data:/volume \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/postgres_data_$(date +%F_%H%M%S).tar.gz -C /volume .

docker run --rm \
  -v web4browser_api_data:/volume \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/api_data_$(date +%F_%H%M%S).tar.gz -C /volume .
```

注意：如果项目目录名不同，volume 名称可能带不同前缀，以 `docker volume ls` 实际输出为准。

## 十一、常用排查命令

查看容器：

```bash
docker compose ps
```

查看 API 日志：

```bash
docker compose logs --tail=200 api
```

查看 web 日志：

```bash
docker compose logs --tail=200 web
```

查看数据库日志：

```bash
docker compose logs --tail=200 db
```

检查 API 健康状态：

```bash
curl -i http://127.0.0.1:8080/api/health
```

检查未登录 API 索引是否被保护：

```bash
curl -i http://127.0.0.1:8080/api/
```

预期返回：

```text
HTTP/1.1 401 Unauthorized
```

检查 `api` 子域是否拦截管理员接口：

```bash
curl -i https://api.web4browser.io/api/admin/overview
```

预期返回：

```text
HTTP/1.1 404 Not Found
```

查看端口占用：

```bash
sudo ss -lntp
```

如果启动时报 `bind: address already in use`，说明端口已被占用。可以修改 `docker-compose.yml` 中的端口，例如：

```yaml
ports:
  - "127.0.0.1:8081:80"
```

同时宿主机 Nginx 的 `proxy_pass` 也要改成：

```nginx
proxy_pass http://127.0.0.1:8081;
```

## 十二、生产安全检查清单

上线前逐项确认：

- 已修改 `docker-compose.yml` 中的 `POSTGRES_PASSWORD`。
- 已修改 `.env.docker` 中的 `DATABASE_URL`，数据库密码和 `POSTGRES_PASSWORD` 一致。
- 已修改 `BOOTSTRAP_ADMIN_EMAIL` 和 `BOOTSTRAP_ADMIN_PASSWORD`。
- 已修改 `ADMIN_EMAILS`，只保留真实管理员邮箱。
- 已修改 `PUBLIC_RELAY_BASE_URL=https://api.web4browser.io/api`。
- 已修改 `ADMIN_ALLOWED_HOSTS=console.web4browser.io`。
- 正式 HTTPS 环境设置 `COOKIE_SECURE=1`。
- 正式环境设置 `ALLOW_MOCK=0`。
- 如果使用 Google 登录，`GOOGLE_REDIRECT_URI` 已改成正式域名。
- 如果使用模型中转，`MINIMAX_API_KEY` 已填写真实 Key。
- Docker web 端口只绑定 `127.0.0.1:8080`。
- 宿主机 Nginx 已启用 HTTPS。
- `console.web4browser.io` 已启用 Basic Auth。
- `api.web4browser.io` 已拦截 `/api/admin/*`、`/api`、`/api/`。
- 防火墙只开放必要端口。
- 已验证 `/api/` 未登录返回 `401`。
- 已验证 `/api/admin/overview` 未登录返回 `401`。
- 已验证管理员能登录后台。
- 已配置数据库备份策略。
