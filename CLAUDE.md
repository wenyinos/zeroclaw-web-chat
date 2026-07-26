# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

ZeroClaw Web Chat：轻量 Web 聊天界面，本身**不含 AI 逻辑**，只做鉴权 + WebSocket 代理 + 消息持久化。真正的推理发生在外部 Gateway（zeroclaw 或 picoclaw），通过 `.env` 的 `AI_BACKEND` 切换。

无构建工具、无框架、无测试。前端是原生 ES module，后端是 Express + ws。

## 命令

```bash
npm install
npm start        # 生产模式，默认端口 3332
npm run dev      # node --watch 热重载
```

无自动化测试。改动后手动冒烟：`POST /api/verify` 登录 → WebSocket `/ws/chat` 能收发 → 刷新页面消息仍在。

服务器日志同时写入 `server.log`（已 gitignore）。

## 架构要点

### 1. 两个 sessionId 不是一回事（最容易踩的坑）

| 变量 | 来源 | 用途 | 传递方式 |
|---|---|---|---|
| `verifiedSessionId` | `/api/verify` 返回，`crypto.randomBytes(16)` | **鉴权凭证**，存在 `lib/sessions.js` 的内存 Map，TTL 12h | HTTP `X-Session-Id` 头 / WS `?auth_session=` |
| `sessionId` | 前端生成 `session-<ts>-<rand>` | **会话分组键**，即 `chat_messages.session_id` 列 | URL `?session=xxx`，随请求 body 上传 |

前端 `sessionId` 存在 URL 里（分享链接即分享会话），`verifiedSessionId` 存在 sessionStorage。混用会导致「鉴权通过但历史消息为空」或「401」。

### 2. WebSocket 协议翻译只在代理层（`lib/ws-proxy.js`）

浏览器**永远只说 zeroclaw 方言**，picoclaw 的差异全部由代理吸收：

```
浏览器 → { type:'message', content, images?, context?, systemPrompt? }
       ↓ USE_PICOCLAW 时 sendToGateway() 转换
Gateway ← { type:'message.send', id:'msg-N', payload:{ content, media?, context?, systemPrompt? } }

Gateway → { type:'message.create', payload:{ content, thought? } }
       ↓ gatewayWs.on('message') 转换
浏览器 ← { type:'message', content } 或 { type:'thinking', content }
```

改动前端消息结构时，**必须同步改 `sendToGateway()` 和 `gatewayWs.on('message')` 两处**，否则 picoclaw 模式静默失效而 zeroclaw 模式正常。

**⚠️ `payload.systemPrompt` 不被 picoclaw 采纳**（已实测验证）。picoclaw 的 system prompt 取自它自己的 `~/.picoclaw/config.json`，不接受 channel 消息覆盖——代理里那段透传是前端单方面的约定。后果：

- 想让模型读到额外背景（长期记忆等），**只能拼进 `content`**，那是唯一确定送达模型的字段。私聊的置顶记忆注入就是这么做的（`withMemory()`）
- **群聊的助手人设同样从未生效过**——`generateGroupReply()` 用的正是这个字段，所以多个助手实际共用 picoclaw 的同一套人设，回复风格不会因助手而异。要真正区分，同样得把人设拼进 content

其他：Gateway 未就绪时消息进 `pendingMessages` 队列，`open` 后补发；双向 ping/pong 保活（`WS_KEEPALIVE_INTERVAL_MS`，默认 25s，连续 6 次未响应主动断开）。

### 3. 私聊和群聊共用同一条 WebSocket

没有第二条连接。路由靠前端两个可变状态：

- `this.messageContext`（`'chat'` | `'group'`）— `handleMessage()` 据此决定消息进私聊还是群聊
- `this.pendingGroupReplies`（`Map<thinkingMsgId, assistant>`）— 群聊待回复队列

**群聊回复是 FIFO 按序匹配的**（`updateGroupReply()` 取 `entries[0]`），不是按消息 ID 匹配。多助手并发回复时若 Gateway 乱序返回，回复会串到错误的助手名下。全部回复完毕后 `messageContext` 复位为 `'chat'`。动 `handleMessage` / `generateGroupReply` 前先理解这套机制。

群聊消息的两段式落库：先以「正在思考...」占位调 `POST /api/group/reply` 存库，收到真实内容后再 `PUT /api/group/messages/:id` 覆盖。

### 4. sql.js 数据库：每次写入全量重写文件

`lib/database.js` 用的是 **sql.js（WASM 内存数据库）**，不是 better-sqlite3（9f2ac6e 之前是）。关键后果：

- 每个 insert/update/delete 后都调 `saveDatabase()` → `db.export()` + `writeFileSync` **整个 `data/chat.db`**
- 没有 WAL、没有事务。`data/chat.db-shm` 和 `chat.db-wal` 是旧驱动残留，无效
- **禁止循环里逐条写**。`/api/sessions/forge` 和 `DELETE /api/sessions/:id` 已经是「每删一条重写一次全库」，是已知性能债，不要复制这个模式
- `initDatabase()` 是异步的，且作为 **`routes/api.js` 的模块副作用**触发。`dbReady` 标志被设置但**没有任何路由检查它**——启动瞬间的请求可能撞上 `db === null`

表：`chat_messages` / `group_messages` / `assistants` / `settings` / `memories` / `documents`。三个默认助手（default / coder / writer）在初始化时 `INSERT OR IGNORE`。

### 5. 环境变量必须延迟读取

`server.js` 里 `dotenv.config()` 在 import 之后执行，所以模块顶层读 `process.env` 会拿到 undefined。既有代码用两种方式规避：

- `routes/api.js` 的 `getConfig()` — 每次调用时读
- `lib/ws-proxy.js` — 在 `setupWsProxy()` 函数体内读

**不要把 env 读取提升到模块顶层。**

### 6. 前端：单个 3400 行 `ClawAgent` 类

`public/js/chat.js` 一个类装下全部逻辑，实例挂在 `window.app`——因为模板里大量使用内联 `onclick="app.xxx()"`，重命名方法会静默断链。

5 个标签页（chat / group / console / memory / settings），`switchTab()` 做懒加载：切到哪个标签才拉哪份数据。移动端底部 tab 和桌面侧边栏共用 `data-tab` 属性。

服务端下发的特性开关（`GET /api/config`）控制 UI 可见性：`imageUploadEnabled`（`IMAGE_UPLOAD_ENABLED`）、`memoryEnabled`（`MEMORY_ENABLED`，默认关）。

记忆的工作方式：`.md` 文件上传后存进 `memories` 表（文件名作标题），**只有置顶（`pinned`）的记忆**会被 `buildMemoryPrompt()` 拼成前缀注入消息正文。`loadMemories()` 顺带刷新 `pinnedMemories` 缓存，所以置顶/删除后无需额外请求。界面显示的始终是用户原话，拼接只发生在发往 Gateway 的载荷里。

### 7. Service Worker 必须保持网络优先

`public/sw.js` 曾是缓存优先，导致 HTML/CSS/JS 改完后用户长期停在旧版本（后台回写没有 `waitUntil` 保护，SW 可能在写回前被终止）。现为**网络优先、离线回退缓存**。

改这里要注意：一旦改回缓存优先，前端任何更新都不会送达用户，而本地开发也会看到「代码改了页面没变」的假象。

### 8. 已知的空实现 / 死代码（别当成能用的功能）

- `GET /api/stickers` 恒返回空数组；`POST /api/stickers` 不落库。贴纸面板只有内置 emoji 可用，上传的贴纸刷新即失
- `routes/api.js` 的 `sessionRecords` Map 未使用
- `lib/utils.js` 的 `ensureChatRecordsDir` / `CHAT_RECORDS_DIR` / `escapeMarkdown` / `formatDateTimeText` 是 SQLite 迁移前的遗留，无引用（`buildSessionMarkdown` 已在会话导出中启用）
- 控制台事件存在内存数组（上限 1000），重启即失
- SSE 广播目前只接了 `broadcastSettings`（设置跨标签页同步）。`broadcastMessage` / `broadcastConsoleEvent` / `broadcastStickers` 仍无调用方，前端却已监听对应事件——接上即可生效
- `handleMessage()` 对空 `content` 的消息也会 `addMessage`，产生空气泡并触发一次 400（`/api/chat/send` 拒绝空消息）

> 历史坑：`sseClients` 曾错存 `req`（可读流，无 `write`），导致任何广播必然抛异常且客户端被移除。现存 `res`。

## 安全约束

- `/api/execute` 是高危面：白名单是 `Map<binary, 允许的参数数组组合>` 精确匹配，外加 `[;&|\`$(){}!<>]` 字符黑名单，`execFile` + `shell:false`。**改这里必须收紧不能放宽**
- `/api/verify` 有 IP 限流（默认 10 次/10 分钟，超限封 15 分钟）+ `crypto.timingSafeEqual` 定长比较
- 除 `/api/config` 和 `/api/verify` 外，所有 API 走 `requireVerifiedSession` 中间件
- WS 升级在 `/ws/chat` 校验 `auth_session`，其余路径直接 404
- `ALLOWED_ORIGINS` 留空 = 拒绝一切跨域请求（不是允许一切）

## 代码风格

- ES Modules，`"type": "module"`，保留分号
- **后端 JS 2 空格缩进，前端 JS/CSS 4 空格缩进**
- camelCase；数据库列名用 snake_case，在 `lib/database.js` 的 map 层转换
- 无 ESLint/Prettier 配置，跟随所在文件既有风格
- 注释和日志用中文
- Commit 遵循 Conventional Commits（`feat(chat):` / `fix(api):`），前后端改动不混在一个 commit

`AGENTS.md` 有额外的贡献规范，与本文件不冲突时以其为准。

## 不提交的文件

`.env`、`data/`（含 `chat.db`）、`*.log`、`chat_records/` 均已 gitignore。改配置只改 `.env.example` 的占位符。
