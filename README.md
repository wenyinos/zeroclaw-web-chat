# ZeroClaw Web Chat

基于 Bootstrap 5 + 原生 JavaScript 的 ZeroClaw AI Gateway Web 聊天界面。

## 快速开始

### 1. 安装与启动

```bash
npm install
npm start
```

### 2. 访问

打开浏览器访问 **http://localhost:3332**

默认访问密钥：`zeroclaw2026`

## 配置

编辑 `.env` 文件：

```env
ZEROCLOW_GATEWAY_URL=http://localhost:42617  # ZeroClaw Gateway 地址
PORT=3332                                     # Web 服务器端口
ACCESS_KEY=zeroclaw2026                       # 页面访问密钥
ZEROCLOW_TOKEN=your-token                     # Gateway 配对令牌（可选）
```

## 功能

- 访问密钥验证保护
- 实时 WebSocket 流式聊天
- Markdown 消息渲染
- 思考过程展示（可折叠）
- 工具调用可视化
- 会话管理与本地持久化
- 自动重连机制
- 响应式设计

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express (ES Module) |
| WebSocket | 直连 ZeroClaw Gateway |
| 前端 | Bootstrap 5 + 原生 JavaScript |
| Markdown | marked.js |

## 项目结构

```
zeroclaw-web-chat/
├── server.js              # Express 服务器
├── .env                   # 环境配置
├── public/
│   ├── index.html         # 主页面
│   ├── css/style.css      # 样式表
│   └── js/chat.js         # 聊天逻辑
└── package.json
```

## 许可证

MIT

## 工具调用说明

### Shell 命令执行

本项目支持前端接收和显示 ZeroClaw AI 的 shell 工具调用。当 AI 返回 `shell(command="命令")` 格式时：

1. **前端检测**：`chat.js` 自动识别工具调用格式
2. **后端代理**：通过 `/api/execute` 端点执行命令
3. **安全限制**：`server.js` 中配置了允许的命令白名单（`uname`、`ls`、`cat`、`df`、`free`、`uptime`、`hostnamectl` 等）

### 复合命令限制

ZeroClaw Gateway 出于安全考虑，**可能拒绝执行包含管道符或逻辑运算符（`&&`、`||`、`;`、`|`）的复合命令**。

例如：
- ❌ `uname -a && hostnamectl && uptime`（可能被拒绝）
- ✅ `uname -a`（正常执行）

**解决方案**：AI 会自动退化为分多次调用单个命令，每个命令独立执行。这是 ZeroClaw 的安全机制，无需修改代码。

### 配置允许的命令

编辑 `~/.zeroclaw/config.toml` 中的 `[autonomy]` 部分：

```toml
[autonomy]
allowed_commands = [
    "uname",
    "hostnamectl",
    "uptime",
    "df",
    "free",
    # ... 更多命令
]
```

修改后需重启 Gateway：`zeroclaw gateway restart`
