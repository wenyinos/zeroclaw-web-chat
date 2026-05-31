# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZeroClaw Web Chat 是轻量级 Web 聊天界面，通过 WebSocket 代理连接 AI Gateway。支持 zeroclaw 和 picoclaw 两种后端，通过 `.env` 切换。

## Commands

```bash
npm install          # 安装依赖
npm start            # 生产模式启动（端口 3332）
npm run dev          # 开发模式（文件热重载）
```

无自动化测试，需手动验证。

## Architecture

### Backend (`server.js`, ~860行)

单文件 Express 服务器，职责：

- **认证**：`POST /api/verify` — Access Key 验证（IP 限流 + timing-safe 比较），返回 sessionId
- **配置**：`GET /api/config` — 返回后端类型、Gateway URL、token
- **会话记录**：
  - `POST /api/sessions/save` — 保存消息到 `chat_records/<id>.md` + `.json`
  - `GET /api/sessions` — 列出所有会话
  - `GET /api/sessions/:id` — 获取会话（返回 Markdown 内容 + JSON 消息数组）
  - `DELETE /api/sessions/:id` — 删除会话文件
- **命令执行**：`POST /api/execute` — 受限 shell 命令（白名单）
- **WebSocket 代理**：`/ws/chat` — 代理到 Gateway，协议转换

**会话管理**：内存 `Map` 存储，TTL 12小时自动清理，每 30 分钟检查。

### WebSocket 代理协议转换

```
浏览器发送: { type: 'message', content: '...', images?: [...] }
        ↓ picoclaw 模式
Gateway 接收: { type: 'message.send', id: 'msg-N', payload: { content: '...', media?: [...] } }

Gateway 发送: { type: 'message.create', payload: { content: '...', thought?: bool } }
        ↓
浏览器接收: { type: 'message', content: '...' } 或 { type: 'thinking', content: '...' }
```

- 后端通过 `AI_BACKEND=zeroclaw|picoclaw` 切换
- picoclaw 支持图片上传（data URL base64）
- 消息缓存：Gateway 未就绪时暂存，就绪后自动发送

### Frontend (`public/`)

- `index.html` — Bootstrap 5 UI，无构建工具
- `js/chat.js` (~1630行) — `ZeroClawChat` 类，单文件包含所有前端逻辑
- `css/style.css` — 自定义样式（亮色/暗色主题）

**前端关键状态**：
- `sessionId`（sessionStorage）— 用于 localStorage 的消息 key
- `verifiedSessionId`（sessionStorage）— API 鉴权用的 session
- `messages[]` — 当前会话消息数组
- `pendingImages[]` — 待发送的图片（data URL）

### 数据流

```
浏览器 → Express 静态文件 / API
       → WebSocket /ws/chat → 代理 → ZeroClaw/PicoClaw Gateway
       → chat_records/*.md + *.json（会话持久化）
```

### 配置

- `.env` 文件存放敏感配置（不提交 Git）
- 核心变量：`AI_BACKEND`, `ZEROCLOW_GATEWAY_URL`, `PICOCLAW_GATEWAY_URL`, `ACCESS_KEY`, `PORT`

## Code Style

- ES Modules（`import/export`），`"type": "module"`
- 后端 JS 2 空格缩进，前端 JS/CSS 4 空格
- camelCase 命名
- 保持分号

## Key Patterns

- 前端无框架，原生 JS + Bootstrap 5
- 后端无数据库，内存存储 + 文件系统
- 认证流程：Access Key → `/api/verify` → sessionId → 后续请求携带 `X-Session-Id`
- WebSocket 升级验证：`auth_session` 查询参数
- 会话记录双格式：`.md`（下载用）+ `.json`（恢复会话用）
