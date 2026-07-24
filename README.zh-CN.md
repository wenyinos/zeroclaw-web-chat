# ZeroClaw Web Chat

[English](./README.md)

ZeroClaw AI Gateway 的轻量 Web 聊天界面（Node.js + SQLite）。

## 快速开始

```bash
npm install
npm start
```

开发模式：

```bash
npm run dev
```

默认访问地址：`http://localhost:3332`  
登录时输入 `.env` 中的 `ACCESS_KEY`。

> 默认密钥 `zeroclaw2026` 仅用于开发，生产环境请立即替换。

## 环境变量

所有配置选项请查看 `.env.example` 文件，其中包含详细注释说明。

## 核心功能

- Access Key 认证，服务端会话验证
- **多后端支持**：通过 `AI_BACKEND` 环境变量切换 ZeroClaw 和 PicoClaw
- 流式 WebSocket 聊天（`/ws/chat` 代理到 Gateway）
- **图片上传**：支持 PicoClaw 视觉识别（仅 PicoClaw 模式）
- Markdown 渲染，支持亮色/暗色主题
- 聊天记录自动保存到 SQLite 数据库
- **会话管理**：新建会话、恢复历史会话、删除会话
- 响应式布局，优化屏幕信息密度
- 自动心跳保活，断线自动重连

## 新功能特性

### 多助手群聊

- 一个聊天室多个 AI 助手
- 3个默认助手：Claw Agent、Code Bot、Writer
- **@提及触发**：输入 `@coder` 或 `@writer` 指定助手回复
- **全员回复**：不带 @提及发送，所有助手同时回复
- **助手设置**：自定义名称、头像、提示词、触发词
- 群聊消息按助手 ID 分别存储

### SQLite 数据库存储

- 所有消息存储在 `data/chat.db`
- 私聊、群聊、设置、记忆、文档分表存储
- 首次运行自动初始化（无需手动创建）
- 启用 WAL 模式，提升并发性能

### 基于 URL 的会话

- 会话 ID 在 URL 中：`http://localhost:3332?session=xxx`
- 分享 URL 即可分享完整对话
- "继续聊天"功能跳转到对应会话 URL
- 刷新页面后消息保留

### Emoji 贴纸面板

- 20个内置 Emoji 贴纸
- 点击插入 Emoji 字符到消息
- 支持自定义贴纸上传

### 设置面板

- 用户名和助手名称自定义
- 主题切换（亮色/暗色）
- 浏览器通知开关
- 设置通过 SSE 实时同步

### 实时更新（SSE）

- Server-Sent Events 实时推送
- 设置、消息、事件跨标签页同步
- 断线自动重连

### PWA 支持

- Service Worker 离线缓存
- 可安装为桌面/移动应用
- 包含 manifest.json

## 架构说明

```
server.js              # 主入口（配置、启动）
lib/
  logger.js            # 日志模块
  sessions.js          # 会话管理
  rateLimiter.js       # 限流模块
  utils.js             # 工具函数
  ws-proxy.js          # WebSocket 代理
  database.js          # SQLite 数据库模块
routes/
  api.js               # REST API 路由
data/
  chat.db              # SQLite 数据库（自动创建）
public/
  index.html           # 主页面
  css/style.css        # 样式（暖色调设计）
  js/chat.js           # 前端逻辑
  sw.js                # Service Worker
  manifest.json        # PWA 配置
```

## API 接口

### 认证
- `POST /api/verify` — 验证访问密钥

### 配置
- `GET /api/config` — 获取服务器配置
- `GET /api/settings` — 获取用户设置
- `PUT /api/settings` — 更新设置

### 私聊
- `GET /api/chat/messages` — 获取聊天消息
- `POST /api/chat/send` — 发送消息

### 群聊
- `GET /api/group/messages` — 获取群聊消息
- `POST /api/group/send` — 发送群聊消息
- `POST /api/group/reply` — 助手回复

### 助手管理
- `GET /api/assistants` — 获取助手列表
- `POST /api/assistants` — 创建助手
- `PUT /api/assistants/:id` — 更新助手
- `DELETE /api/assistants/:id` — 删除助手

### 会话管理
- `GET /api/sessions` — 获取会话列表
- `GET /api/sessions/:id` — 获取会话详情
- `DELETE /api/sessions/:id` — 删除会话
- `POST /api/sessions/forge` — 清理会话

### 其他
- `GET /api/stickers` — 获取贴纸列表
- `POST /api/stickers` — 上传贴纸
- `GET /api/memories` — 获取记忆列表
- `GET /api/documents` — 获取文档列表
- `GET /api/stream` — SSE 端点

## 部署指南

### 环境要求

- Node.js 18+
- npm 或 yarn

### 部署步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/zeroclaw-web-chat.git
   cd zeroclaw-web-chat
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，填入你的配置
   ```

4. **启动服务**
   ```bash
   # 生产模式
   npm start

   # 开发模式（自动重载）
   npm run dev
   ```

5. **访问应用**
   浏览器打开 `http://localhost:3332`

### Docker 部署（可选）

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3332
CMD ["node", "server.js"]
```

```bash
docker build -t zeroclaw-web-chat .
docker run -p 3332:3332 -v ./data:/app/data zeroclaw-web-chat
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://localhost:3332;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 数据备份

备份 `data/` 目录即可保留：
- `chat.db` — 所有消息和设置
- `stickers/` — 自定义贴纸

## 故障排除（WebSocket 握手 401）

如果代理连接后立即断开（`1006/1011`），通常是 Gateway 握手认证失败。

直接连接 Gateway 验证握手状态：

```bash
curl --http1.1 -sv "http://127.0.0.1:42617/ws/chat?session_id=test&token=<TOKEN>" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-api-key: <TOKEN>" \
  -H "x-zeroclaw-token: <TOKEN>" \
  -o /dev/null
```

- 返回 `HTTP/1.1 101 Switching Protocols`：Gateway 握手正常，检查代理/前端状态
- 返回 `HTTP/1.1 401 Unauthorized`：Gateway 配对/Token 配置不匹配

## 安全说明

- 登录接口包含速率限制和临时封禁
- `/api/execute` 仅允许白名单命令，阻止注入字符
- 配置 `ALLOWED_ORIGINS` 并使用强密钥
- SQLite 数据库文件应定期备份

## 许可证

Apache License Version 2.0
