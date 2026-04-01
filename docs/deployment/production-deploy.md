# 生产部署指南

> ⚠️ 本文档为骨架版本，待实际生产部署时完善细节。

## 概述

Seedance Studio 生产部署包含两个服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| Python 后端 | 8787 | API 服务 + 反向代理 + 媒体文件服务 |
| Next.js 前端 | 3001 | SSR/静态页面服务 |

---

## 构建步骤

### 前端构建

```bash
cd "oii前端/oiioii-clone/"
npm install --production
npm run build
```

构建产物位于 `.next/` 目录。

### 后端准备

```bash
pip install -r requirements.txt
```

确保 `.local-secrets.json` 配置正确，或通过环境变量传入配置。

---

## 启动服务

### 后端启动

#### 直接运行

```bash
python server.py
```

#### 使用 systemd（Linux）

创建 `/etc/systemd/system/seedance-backend.service`：

```ini
[Unit]
Description=Seedance Studio Backend
After=network.target mysql.service

[Service]
Type=simple
User=seedance
WorkingDirectory=/opt/seedance
Environment=VIDEO_CONSOLE_HOST=0.0.0.0
Environment=VIDEO_CONSOLE_PORT=8787
Environment=VIDEO_MODEL_API_KEY=sk-your-key
Environment=CORS_ORIGIN=https://your-domain.com
ExecStart=/usr/bin/python3 server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable seedance-backend
sudo systemctl start seedance-backend
```

#### 使用 PM2（跨平台）

```bash
pm2 start server.py --name seedance-backend --interpreter python3
pm2 save
pm2 startup
```

### 前端启动

#### 直接运行

```bash
cd "oii前端/oiioii-clone/"
npm start
```

#### 使用 PM2

```bash
cd "oii前端/oiioii-clone/"
pm2 start npm --name seedance-frontend -- start
pm2 save
```

---

## Nginx 反向代理配置

```nginx
upstream seedance_backend {
    server 127.0.0.1:8787;
}

upstream seedance_frontend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name your-domain.com;

    # 强制 HTTPS 重定向
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书
    ssl_certificate     /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # API 请求 → 后端
    location /api/ {
        proxy_pass http://seedance_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 流式响应支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # 媒体文件 → 后端
    location /media/ {
        proxy_pass http://seedance_backend;
        proxy_set_header Host $host;

        # 大文件支持
        proxy_max_temp_file_size 0;
        proxy_buffering off;
    }

    # 其他请求 → 前端
    location / {
        proxy_pass http://seedance_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（HMR 等）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## HTTPS 配置建议

### Let's Encrypt（免费证书）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 自签名证书（内网/测试）

```bash
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /etc/ssl/private/seedance.key \
  -out /etc/ssl/certs/seedance.crt \
  -subj "/CN=seedance.local"
```

---

## 端口和域名规划

| 环境 | 前端地址 | 后端地址 | 说明 |
|------|----------|----------|------|
| 本地开发 | `http://localhost:3001` | `http://127.0.0.1:8787` | 直连 |
| 内网测试 | `http://192.168.x.x:3001` | `http://192.168.x.x:8787` | 需设置 `VIDEO_CONSOLE_HOST=0.0.0.0` |
| 生产 | `https://your-domain.com` | Nginx 反代 | 统一域名，Nginx 分发 |

---

## 生产环境检查清单

- [ ] MySQL 已启动且数据库已创建
- [ ] `.local-secrets.json` 配置完整（或环境变量已设置）
- [ ] `storage/` 目录存在且有写入权限
- [ ] 上游 API (`zlhub.xiaowaiyou.cn`) 网络可达
- [ ] AI Chat (`peiqian.icu`) 网络可达
- [ ] CORS_ORIGIN 设置为实际前端域名
- [ ] SSL 证书已配置
- [ ] 防火墙允许 80/443 端口
- [ ] 服务配置为开机自启（systemd/PM2）
- [ ] 日志收集方案已就位

---

## 待完善事项

- [ ] Docker 容器化部署方案
- [ ] Docker Compose 一键编排
- [ ] CI/CD 自动化部署流水线
- [ ] 监控和告警配置
- [ ] 日志轮转策略
- [ ] 数据库备份方案
- [ ] CDN 静态资源加速
