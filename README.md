# ZeroClaw Web Chat

基于 Bootstrap 5 + 原生 JavaScript 的 ZeroClaw AI Gateway Web 聊天界面。

**GitHub 仓库**: https://github.com/wenyinos/zeroclaw-web-chat

## 功能特性

- ✅ 访问密钥验证保护
- ✅ 实时 WebSocket 流式聊天
- ✅ 思考过程展示（可折叠）
- ✅ 工具调用可视化
- ✅ Markdown 消息渲染
- ✅ 会话管理与本地持久化
- ✅ 自动重连机制
- ✅ 响应式设计

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置（可选）

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
ZEROCLOW_GATEWAY_URL=http://localhost:8190   # Gateway 地址
PORT=3332                                     # Web 服务器端口
ACCESS_KEY=zeroclaw2026                       # 页面访问密钥（建议修改）
# ZEROCLOW_TOKEN=                             # 可选：Gateway 认证令牌
```

### 3. 启动服务

确保 ZeroClaw Gateway 已启动，然后运行：

```bash
# 开发模式（文件变化自动重启）
npm run dev

# 或生产模式
npm start
```

### 4. 访问

打开浏览器访问 http://localhost:3332，输入访问密钥（默认 `zeroclaw2026`）即可开始对话。

## 使用说明

- **发送消息**: 输入框输入后按 `Enter` 发送，`Shift + Enter` 换行
- **设置**: 点击右上角齿轮图标可配置 Gateway 地址和认证令牌
- **清空会话**: 点击垃圾桶按钮清空当前会话及本地存储
- **会话持久化**: 聊天记录自动保存到浏览器 localStorage，刷新不丢失

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express |
| WebSocket | ws 库 |
| 前端 | Bootstrap 5 + 原生 JavaScript (ES Module) |
| Markdown | marked.js |
| 图标 | Bootstrap Icons |

## 项目结构

```
zeroclaw-web-chat/
├── server.js              # Express 服务器 + API 路由
├── package.json           # 项目依赖
├── .env.example          # 环境变量示例
├── start.sh              # 启动脚本
├── public/               # 前端文件
│   ├── index.html        # 主页面
│   ├── robots.txt        # 爬虫规则
│   ├── favicon/          # 网站图标
│   ├── css/style.css     # 样式表
│   └── js/chat.js        # 聊天逻辑
└── README.md
```

## 与 Gateway 的集成

Web Chat 通过 WebSocket 连接到 ZeroClaw gateway 的 `/ws/chat` 端点，使用 `zeroclaw.v1` 协议。

**支持的 WebSocket 消息类型**:
- 客户端: `{ "type": "message", "content": "..." }`
- 服务端: `session_start`, `connected`, `thinking`, `chunk`, `chunk_reset`, `done`, `message`, `tool_call`, `tool_result`, `error`

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| 连接失败 | 确认 Gateway 正在运行，检查 URL 配置 |
| 消息发送失败 | 检查 WebSocket 连接状态指示灯 |
| 样式异常 | 确保网络畅通（需加载 CDN 资源） |

## 开发

- `public/js/chat.js` - 前端聊天逻辑（`ZeroClawChat` 类）
- `public/css/style.css` - 样式定制（支持 CSS 变量）
- `public/index.html` - HTML 结构

打开浏览器开发者工具 > Console 查看连接日志，Network > WS 监控 WebSocket 通信。

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
