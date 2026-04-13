# ZeroClaw Web Chat

基于 Bootstrap 5 + Node.js 的 ZeroClaw Web 网页聊天界面。

## 功能特性

- ✅ 实时 WebSocket 聊天连接
- ✅ 流式消息渲染（支持思考过程显示）
- ✅ 工具调用可视化
- ✅ Markdown 消息渲染
- ✅ 会话管理与持久化
- ✅ 自动重连机制
- ✅ 响应式设计（支持移动端）
- ✅ 美观的 Bootstrap UI

## 快速开始

### 1. 安装依赖

```bash
cd /home/zemi/MyDev/zeroclaw-web-chat
npm install
```

### 2. 配置（可选）

复制环境变量文件并根据需要修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# ZeroClaw Gateway 地址
ZEROCLOW_GATEWAY_URL=http://localhost:8190

# Web Chat 服务器端口
PORT=3332

# 可选：认证令牌（如果你的 zeroclaw gateway 需要）
# ZEROCLOW_TOKEN=your_token_here
```

### 3. 启动 ZeroClaw Gateway

确保 ZeroClaw gateway 正在运行：

```bash
cd /home/zemi/MyDev/zeroclaw
zeroclaw gateway
```

### 4. 启动 Web Chat

```bash
# 开发模式（自动重启）
npm run dev

# 或生产模式
npm start
```

### 5. 访问应用

打开浏览器访问: http://localhost:3332

## 使用说明

### 基本聊天
- 在输入框中输入消息
- 按 `Enter` 发送消息
- 按 `Shift + Enter` 换行

### 设置
点击右上角的齿轮图标可以配置：
- **Gateway 地址**: ZeroClaw gateway 的 URL
- **认证令牌**: 如果 gateway 需要认证

### 功能特性

#### 流式消息
AI 回复会实时显示，你可以看到：
- 思考过程（可折叠）
- 实时生成的内容
- 打字指示器动画

#### 工具调用
当 AI 执行工具操作时，会显示：
- 工具名称
- 调用参数
- 执行状态和结果

#### 会话管理
- 每次浏览器会话自动创建新会话 ID
- 聊天记录自动保存到浏览器本地存储
- 可点击垃圾桶按钮清空当前会话

## 技术栈

- **后端**: Node.js + Express
- **前端**: Bootstrap 5 + 原生 JavaScript
- **WebSocket**: ws 库
- **Markdown**: marked.js
- **图标**: Bootstrap Icons

## 项目结构

```
web-chat/
├── server.js              # Express 服务器
├── package.json           # 项目依赖
├── .env.example          # 环境变量示例
├── public/               # 前端文件
│   ├── index.html        # 主页面
│   ├── css/
│   │   └── style.css    # 样式表
│   └── js/
│       └── chat.js      # 聊天逻辑
└── README.md            # 本文档
```

## 与 ZeroClaw Gateway 的集成

### WebSocket 协议

Web Chat 通过 WebSocket 连接到 ZeroClaw gateway 的 `/ws/chat` 端点。

**连接 URL**:
```
ws://localhost:8190/ws/chat?session_id=YOUR_SESSION_ID&token=YOUR_TOKEN
```

**消息格式**:

客户端发送:
```json
{
  "type": "message",
  "content": "你的消息内容"
}
```

服务端推送:
- `session_start` - 会话开始
- `connected` - 连接成功
- `thinking` - AI 思考内容
- `chunk` - 消息片段（流式）
- `chunk_reset` - 重置当前流
- `done` / `message` - 消息完成
- `tool_call` - 工具调用
- `tool_result` - 工具结果
- `error` - 错误信息

### 认证方式

支持三种认证方式：
1. URL 参数: `?token=YOUR_TOKEN`
2. WebSocket 协议: `Sec-WebSocket-Protocol: bearer.TOKEN`
3. 无需认证（本地开发）

## 开发

### 添加新功能

主要文件：
- `public/js/chat.js` - 前端聊天逻辑
- `public/css/style.css` - 样式定制
- `public/index.html` - HTML 结构

### 调试

打开浏览器开发者工具查看：
- Console: 查看连接状态和错误信息
- Network > WS: 监控 WebSocket 通信
- Application > Local Storage: 查看保存的消息

## 故障排除

### 连接失败
1. 确认 ZeroClaw gateway 正在运行
2. 检查 gateway URL 是否正确
3. 查看浏览器控制台的错误信息

### 消息发送失败
1. 检查 WebSocket 连接状态（查看状态指示灯）
2. 确认 gateway 配置正确
3. 尝试刷新页面重新连接

### 样式问题
- 确保网络连接正常（需要加载 CDN 资源）
- 或使用本地 Bootstrap 文件

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
