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
- WebSocket 聊天（`/ws/chat` 代理到 Gateway）
- **等待反馈与逐字渲染**：发送后立即显示输入指示器，回复到达后逐字呈现
- **消息操作**：复制、回复、收藏、删除、重新生成
- **停止**：中止逐字动画并立即显示已收到的完整内容
- **图片上传**：支持 PicoClaw 视觉识别（仅 PicoClaw 模式）
- Markdown 渲染（代码块保留缩进换行、长代码横向滚动），支持亮色/暗色主题
- 聊天记录自动保存到 SQLite 数据库
- **会话管理**：新建、恢复、导出 Markdown、删除（私聊与群聊各自独立）
- 响应式布局，优化屏幕信息密度
- 自动心跳保活，断线自动重连

## 新功能特性

### 多助手群聊

- 一个聊天室多个 AI 助手
- 3个默认助手：Claw Agent、Code Bot、Writer
- **@提及触发**：输入 `@coder` 或 `@writer` 指定助手回复
- **全员回复**：不带 @提及发送，所有助手**依次**回复（见下方说明）
- **助手设置**：自定义名称、头像、提示词、触发词，各助手按自己的人设回复
- **会话管理**：与私聊同构，可新建、切换、继续、导出、删除
- 超时兜底：单个助手 90 秒无响应则标记并继续下一个

> **为什么是依次而不是同时**：一条 WebSocket 对应 Gateway 的一个 agent 会话。
> 实测同时发出 N 条请求，Gateway 只会产出一条完整回复，其余请求仅返回思考过程，
> 对应助手会永远停在「正在思考...」。因此改为等前一个回复落地再发起下一个。
> 代价是耗时随助手数量线性增长（3 个助手约 30 秒）。

### SQLite 数据库存储

- 所有消息存储在 `data/chat.db`（sql.js / WASM）
- 私聊、群聊、设置、记忆、文档分表存储
- 首次运行自动初始化，升级时自动补列迁移，均无需手动操作
- 每次写入会重写整个数据库文件，因此图片、贴纸等二进制内容存文件系统而非入库

> **升级提示**：`group_messages` 在本版本新增 `session_id` 列。启动时会自动检测并
> `ALTER TABLE`，存量群聊消息归入名为 `group-legacy` 的历史会话，不会丢失。
> 迁移是原地改写且无回滚机制，升级前请备份 `data/chat.db`。

### 基于 URL 的会话

- 私聊会话：`http://localhost:3332?session=xxx`
- 群聊会话：`http://localhost:3332?group=xxx`
- 分享 URL 即可分享完整对话
- "继续聊天"功能跳转到对应会话 URL
- 刷新页面后消息保留

### 记忆（长期记忆）

需将 `MEMORY_ENABLED` 设为 `true` 才会显示该标签页，默认关闭。

- **上传 Markdown**：`.md` 文件导入为记忆，文件名作标题、正文作内容
- **置顶才生效**：只有 📌 置顶的记忆会随消息发送给 AI，可精确控制上下文成本
- 界面上显示的始终是你输入的原话，记忆只拼接在发往 Gateway 的载荷里
- 支持手写记忆、按关键词搜索、单条上限 100KB

```
记忆列表
⭐ 我的编码偏好.md   ← 随对话发送
⭐ 项目背景.md       ← 随对话发送
☆  会议纪要.md      ← 不发送
```

### 贴纸面板

- 20个内置 Emoji，点击插入到输入框
- **自定义贴纸**：上传后存为 `data/stickers/` 下的文件，由 `/stickers` 静态服务提供
- 限制 png/jpg/gif/webp、单张 2MB；删除接口带文件名白名单与目录归属校验

### 设置面板

- 用户名和助手名称自定义
- 主题切换（亮色/暗色）
- 浏览器通知开关
- 设置更新后经 SSE 推送到其他已打开的标签页

### 实时更新（SSE）

- `GET /api/stream` 建立连接，首帧下发快照，其后 25 秒心跳
- 目前仅**设置变更**会广播；消息与控制台事件的广播接口已预留但尚未接入
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
  stickers/            # 自定义贴纸文件（自动创建）
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
- `DELETE /api/chat/messages/:id` — 删除消息
- `POST /api/chat/messages/:id/favorite` — 切换收藏

### 群聊
- `GET /api/group/messages` — 获取群聊消息（可按 `session_id` / `assistant_id` 过滤）
- `POST /api/group/send` — 发送群聊消息
- `POST /api/group/reply` — 助手回复
- `PUT /api/group/messages/:id` — 更新消息内容
- `DELETE /api/group/messages/:id` — 删除消息

### 群聊会话
- `GET /api/group/sessions` — 获取群聊会话列表
- `GET /api/group/sessions/:id` — 获取会话详情（含导出用 Markdown）
- `DELETE /api/group/sessions/:id` — 删除整个会话

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

### 记忆与文档
- `GET /api/memories` — 获取记忆列表
- `POST /api/memories` — 创建记忆（Markdown 上传复用此接口）
- `PUT /api/memories/:id` — 更新记忆
- `POST /api/memories/:id/pin` — 切换置顶（决定是否随对话发送）
- `DELETE /api/memories/:id` — 删除记忆
- `GET /api/documents` — 获取文档列表

### 其他
- `GET /api/stickers` — 获取贴纸列表
- `POST /api/stickers` — 上传贴纸（data URL，落盘到 `data/stickers/`）
- `DELETE /api/stickers/:id` — 删除贴纸
- `POST /api/execute` — 执行受限的系统信息查询命令（白名单）
- `GET /api/console/events` — 获取控制台事件
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
