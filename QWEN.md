# ZeroClaw Web Chat

## 项目概述

ZeroClaw Web Chat 是一个基于 Bootstrap 5 + 原生 JavaScript 的 Web 聊天界面，用于与 ZeroClaw AI Gateway 进行实时对话。项目采用轻量级架构，通过 Node.js 服务器的 **WebSocket 代理**功能将前端请求内部转发到 ZeroClaw Gateway，无需暴露 Gateway 端口。

### 核心功能

- ✅ 访问密钥验证保护（进入聊天前需输入密钥）
- ✅ 实时 WebSocket 流式聊天（通过服务器内部代理）
- ✅ 思考过程展示（可折叠）
- ✅ 工具调用可视化
- ✅ Markdown 消息渲染
- ✅ 会话管理与本地持久化（localStorage）
- ✅ 自动重连机制
- ✅ 响应式设计（支持移动端）
- ✅ **日间/夜间主题切换**（右上角按钮）

### 架构

```
浏览器 (Web Chat)  ←→  Node.js 服务器 (3332)  ←→  ZeroClaw Gateway (42617)
   http://:3332         WebSocket 代理            ws://localhost:42617
   (静态文件服务)        (内部转发)                (AI Agent)
```

**工作流程**:
1. 用户访问 http://localhost:3332
2. 输入访问密钥通过验证
3. 前端建立 WebSocket 连接到 Node.js 服务器的 `/ws/chat`
4. 服务器内部代理到 ZeroClaw Gateway
5. Gateway 调用 Agent 进行实时对话

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express (ES Module) |
| WebSocket | 内部代理到 ZeroClaw Gateway (`ws` 库) |
| 前端 | Bootstrap 5.3.3 + 原生 JavaScript |
| Markdown | marked.js |
| 图标 | Bootstrap Icons 1.11.3 |
| 环境变量 | dotenv |

## 项目结构

```
zeroclaw-web-chat/
├── server.js              # Express 服务器 + API 路由 + WebSocket 代理
├── package.json           # 项目依赖和脚本
├── .env.example          # 环境变量示例
├── .env                  # 实际环境配置
├── server.log            # 运行时日志文件
├── QWEN.md               # 项目上下文文档
├── README.md             # 项目说明文档
├── .gitignore            # Git 忽略规则
├── LICENSE               # MIT 许可证
├── public/
│   ├── index.html        # 主页面（验证界面 + 聊天界面）
│   ├── robots.txt        # 爬虫规则（禁止索引）
│   ├── favicon/          # 网站图标集
│   │   ├── favicon.ico
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   └── apple-touch-icon.png
│   ├── css/
│   │   └── style.css     # 样式表（CSS 变量系统、日间/夜间主题、动画效果）
│   └── js/
│       └── chat.js        # 聊天逻辑（ZeroClawChat 类）
└── node_modules/          # 依赖包
```

## 构建和运行

### 前置条件

- Node.js (支持 ES Module)
- ZeroClaw Gateway 正在运行（默认端口 42617）

### 安装和启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，已有默认配置）
cp .env.example .env

# 3. 启动服务
npm start          # 生产模式
npm run dev        # 开发模式（文件变化自动重启）
```

### 访问

- **本机访问**: `http://localhost:3332`
- **局域网访问**: `http://<服务器IP>:3332`
- 默认访问密钥: `zeroclaw2026`（可在 `.env` 中修改）

### 环境变量配置

编辑 `.env` 文件:

```env
# ZeroClaw Gateway 地址（服务器内部使用 localhost）
ZEROCLOW_GATEWAY_URL=http://localhost:42617

# Web Chat 服务器端口
PORT=3332

# 可选：Gateway 认证令牌
# ZEROCLOW_TOKEN=

# 页面访问密钥
ACCESS_KEY=zeroclaw2026
```

## 关键组件

### server.js

Express 服务器，提供以下功能:
- 静态文件服务（`public/` 目录）
- CORS 支持
- `/api/config` - 返回 Gateway 配置（令牌脱敏）
- `/api/verify` - 验证访问密钥，生成会话 ID
- `/api/execute` - 执行 shell 命令（带白名单安全检查）
- **WebSocket 代理**: 将 `/ws/chat` 代理到 ZeroClaw Gateway
- 环境变量加载（dotenv）
- **日志系统**: 
  - 自动记录所有请求到 `server.log` 文件
  - 支持 INFO、WARN、ERROR 三个日志级别
  - 同时输出到控制台和日志文件
  - 优雅关闭和异常处理（SIGTERM、SIGINT、uncaughtException）

### public/js/chat.js

核心聊天逻辑（`ZeroClawChat` 类）:
- **WebSocket 连接**: 使用相对路径连接 `/ws/chat`，通过服务器代理到 Gateway
- **智能地址处理**: 自动将 `localhost` 替换为当前主机名，适配移动端访问
- **消息处理**: 处理 `session_start`, `thinking`, `chunk`, `tool_call`, `tool_result`, `done`, `error` 等事件
- **流式渲染**: 实时累积并显示消息片段和思考过程
- **持久化**: 使用 localStorage 保存和加载消息历史
- **主题切换**: 支持日间/夜间主题，选择保存到 localStorage
- **自动重连**: WebSocket 断开后 3 秒自动重连

### public/index.html

单页面应用:
- 验证界面（密钥输入）
- 聊天界面（消息列表、输入框、设置面板）
- 主题切换按钮（右上角）
- 设置模态框（Gateway 地址和令牌配置）

### public/css/style.css

样式表:
- CSS 变量系统，支持主题定制
- 日间主题（默认）和夜间主题
- 响应式设计，适配移动端
- 动画效果（消息滑入、打字指示器等）
- 自定义滚动条样式

## WebSocket 协议

### 连接 URL

前端连接: `ws://<server>:<port>/ws/chat?session_id=<ID>&token=<TOKEN>`

服务器内部代理到: `ws://localhost:42617/ws/chat?session_id=<ID>&token=<TOKEN>`

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

## 开发规范

### 代码风格

- **后端**: ES Module 语法 (`import/export`)
- **前端**: 原生 JavaScript (ES6+ 类)，无框架依赖
- **样式**: CSS 变量系统，支持主题定制

### CSS 变量

定义在 `public/css/style.css` 中:

```css
:root {
  --primary-color: #0d6efd;
  --secondary-color: #6c757d;
  --success-color: #198754;
  --danger-color: #dc3545;
  --bg-color: #f8f9fa;
  --chat-bg: #ffffff;
  --user-msg-bg: #0d6efd;
  --agent-msg-bg: #f1f3f5;
  /* ... 更多变量 */
}

/* 夜间主题 */
[data-theme="dark"] {
  --bg-color: #1a1d21;
  --chat-bg: #212529;
  --agent-msg-bg: #2c3035;
  /* ... 更多变量 */
}
```

### 安全性

- 访问密钥存储在 `sessionStorage`（会话级别）
- Gateway 令牌支持 Bearer Token 认证
- Shell 命令执行带白名单安全检查
- 静态文件通过 `robots.txt` 禁止索引
- 建议修改默认 `ACCESS_KEY` 为强密钥

## 依赖包

| 包 | 版本 | 用途 |
|---|------|------|
| express | ^4.21.0 | Web 框架 |
| ws | ^8.18.0 | WebSocket 客户端/服务器 |
| cors | ^2.8.5 | 跨域支持 |
| dotenv | ^16.4.5 | 环境变量加载 |
| uuid | ^10.0.0 | UUID 生成 |
| http-proxy-middleware | ^3.0.5 | HTTP 代理（备用） |

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| 服务无法启动 | 检查端口 3332 是否被占用 (`lsof -i :3332`) |
| WebSocket 连接失败 | 确认 Gateway 正在运行 (`zeroclaw gateway`) |
| 401 Unauthorized | 检查 `ZEROCLOW_TOKEN` 是否正确 |
| 消息无响应 | 查看浏览器控制台和 Gateway 日志 |
| 样式异常 | 确保网络畅通（需加载 CDN 资源） |
| 手机端无法连接 | 确保手机和服务器在同一局域网，使用服务器 IP 访问 |

## 主题切换

### 使用方式

1. 进入聊天界面后，点击右上角的 🌙/☀️ 按钮
2. 主题会立即切换并保存到 localStorage
3. 下次访问时自动应用上次选择的主题

### 实现原理

- 通过 `data-theme` 属性控制 CSS 变量
- 使用 Bootstrap Icons 的月亮/太阳图标
- 主题选择持久化到 localStorage

## 相关文档

- `README.md` - 项目说明和快速开始
- `.env.example` - 环境变量示例配置
- `server.log` - 运行时日志文件

## 许可证

MIT
