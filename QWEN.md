# ZeroClaw Web Chat

## Project Overview

ZeroClaw Web Chat 是一个基于 Bootstrap 5 + 原生 JavaScript 的 Web 聊天界面，用于与 ZeroClaw AI Gateway 进行实时对话。项目采用轻量级架构，前端通过 WebSocket 直接连接 ZeroClaw Gateway，Node.js 后端仅提供静态文件服务、访问密钥验证和配置 API。

### 核心功能

- ✅ 访问密钥验证保护（进入聊天前需输入密钥）
- ✅ 实时 WebSocket 流式聊天（直连 ZeroClaw Gateway）
- ✅ 思考过程展示（可折叠）
- ✅ 工具调用可视化
- ✅ Markdown 消息渲染
- ✅ 会话管理与本地持久化（localStorage）
- ✅ 自动重连机制
- ✅ 响应式设计（支持移动端）

### 架构

```
浏览器 (Web Chat)  ←→  ZeroClaw Gateway (WebSocket)
   http://:3332         ws://:42617/ws/chat
   (Node.js 静态服务)    (AI Agent)
```

**工作流程**:
1. 用户访问 http://localhost:3332
2. 输入访问密钥通过验证
3. 前端建立 WebSocket 连接到 ZeroClaw Gateway
4. Gateway 调用 Agent 进行实时对话

## Technology Stack

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express (ES Module) |
| WebSocket | 直连 ZeroClaw Gateway (zeroclaw.v1 协议) |
| 前端 | Bootstrap 5.3.3 + 原生 JavaScript |
| Markdown | marked.js |
| 图标 | Bootstrap Icons 1.11.3 |
| 环境变量 | dotenv |

## Project Structure

```
zeroclaw-web-chat/
├── server.js              # Express 服务器 + API 路由 (/api/config, /api/verify)
├── package.json           # 项目依赖和脚本
├── .env.example          # 环境变量示例
├── .env                  # 实际环境配置
├── start.sh              # 启动脚本
├── QWEN.md               # 项目上下文文档
├── README.md             # 项目说明文档
├── SETUP_GUIDE.md        # 接入 ZeroClaw 详细指南
├── WEBSOCKET_GUIDE.md    # WebSocket 协议对接指南
├── ZEROCLOW_WEBHOOK_GUIDE.md  # Webhook 配置指南
├── public/
│   ├── index.html        # 主页面（验证界面 + 聊天界面）
│   ├── robots.txt        # 爬虫规则（禁止索引）
│   ├── favicon/          # 网站图标集
│   │   ├── favicon.ico
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   └── apple-touch-icon.png
│   ├── css/
│   │   └── style.css     # 样式表（CSS 变量系统、动画效果）
│   └── js/
│       └── chat.js        # 聊天逻辑（ZeroClawChat 类）
└── node_modules/          # 依赖包
```

## Building and Running

### Prerequisites

- Node.js (支持 ES Module)
- ZeroClaw Gateway 正在运行（默认端口 42617）

### Setup

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，已有默认配置）
cp .env.example .env
```

### Running

```bash
# 开发模式（文件变化自动重启）
npm run dev

# 生产模式
npm start

# 使用启动脚本
./start.sh
```

### Access

- 浏览器访问: `http://localhost:3332`
- 默认访问密钥: `zeroclaw2026`（可在 `.env` 中修改）

### Configuration

编辑 `.env` 文件:

```env
# ZeroClaw Gateway 地址
ZEROCLOW_GATEWAY_URL=http://localhost:42617

# Web Chat 服务器端口
PORT=3332

# 可选：Gateway 认证令牌
# ZEROCLOW_TOKEN=

# 页面访问密钥
ACCESS_KEY=zeroclaw2026
```

## Key Components

### server.js

Express 服务器，提供以下功能:
- 静态文件服务（`public/` 目录）
- CORS 支持
- `/api/config` - 返回 Gateway 配置（令牌脱敏）
- `/api/verify` - 验证访问密钥，生成会话 ID
- 环境变量加载（dotenv）
- **日志系统**: 
  - 自动记录所有请求到 `server.log` 文件
  - 支持 INFO、WARN、ERROR 三个日志级别
  - 同时输出到控制台和日志文件
  - 优雅关闭和异常处理（SIGTERM、SIGINT、uncaughtException）

### public/js/chat.js

核心聊天逻辑（`ZeroClawChat` 类）:
- **WebSocket 连接**: 直连 ZeroClaw Gateway 的 `/ws/chat` 端点
- **消息处理**: 处理 `session_start`, `thinking`, `chunk`, `tool_call`, `tool_result`, `done`, `error` 等事件
- **流式渲染**: 实时累积并显示消息片段和思考过程
- **持久化**: 使用 localStorage 保存和加载消息历史
- **自动重连**: WebSocket 断开后 3 秒自动重连

### public/index.html

单页面应用:
- 验证界面（密钥输入）
- 聊天界面（消息列表、输入框、设置面板）
- 设置模态框（Gateway 地址和令牌配置）

## WebSocket Protocol

### 连接 URL

```
ws://<gateway-host>:<port>/ws/chat?session_id=<ID>&token=<TOKEN>
```

### 客户端消息

```json
{"type": "message", "content": "消息内容"}
```

### 服务端消息

| 类型 | 说明 |
|------|------|
| `session_start` | 会话启动通知（含历史消息数） |
| `connected` | 连接确认（可选握手） |
| `thinking` | AI 思考内容 |
| `chunk` | 消息片段（流式） |
| `chunk_reset` | 重置流式缓冲区 |
| `done` | 消息完成（含完整回复） |
| `tool_call` | 工具调用 |
| `tool_result` | 工具执行结果 |
| `error` | 错误通知 |
| `agent_start` / `agent_end` | Agent 生命周期事件 |

## Development Conventions

### Code Style

- **后端**: ES Module 语法 (`import/export`)
- **前端**: 原生 JavaScript (ES6+ 类)，无框架依赖
- **样式**: CSS 变量系统，支持主题定制

### CSS Variables

定义在 `public/css/style.css` 中:

```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --success-color: #28a745;
  --danger-color: #dc3545;
  /* ... 更多变量 */
}
```

### Security

- 访问密钥存储在 `sessionStorage`（会话级别）
- Gateway 令牌支持 Bearer Token 认证
- 静态文件通过 robots.txt 禁止索引
- 建议修改默认 `ACCESS_KEY` 为强密钥

## Dependencies

| 包 | 版本 | 用途 |
|---|------|------|
| express | ^4.21.0 | Web 框架 |
| ws | ^8.18.0 | WebSocket 客户端（备用） |
| cors | ^2.8.5 | 跨域支持 |
| dotenv | ^16.4.5 | 环境变量加载 |
| uuid | ^10.0.0 | UUID 生成 |

## Troubleshooting

| 问题 | 解决方案 |
|------|---------|
| 服务无法启动 | 检查端口 3332 是否被占用 (`lsof -i :3332`) |
| WebSocket 连接失败 | 确认 Gateway 正在运行 (`zeroclaw gateway`) |
| 401 Unauthorized | 检查 `ZEROCLOW_TOKEN` 是否正确 |
| 消息无响应 | 查看浏览器控制台和 Gateway 日志 |
| 样式异常 | 确保网络畅通（需加载 CDN 资源） |

## Related Documentation

- `README.md` - 项目说明和快速开始
- `SETUP_GUIDE.md` - 接入 ZeroClaw 的详细指南
- `WEBSOCKET_GUIDE.md` - WebSocket 协议完整说明
- `ZEROCLOW_WEBHOOK_GUIDE.md` - Webhook 渠道配置指南

## License

MIT
