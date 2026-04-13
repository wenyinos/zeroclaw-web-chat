# ZeroClaw Web Chat

基于 Bootstrap 5 + Node.js 的 ZeroClaw AI Gateway Web 聊天界面。

## 快速开始

```bash
npm install
npm start
```

访问地址：
- 本地：**http://localhost:3332**
- 测试：**https://zero.wenyinos.com/**

默认密钥：`zeroclaw2026`

## 配置

编辑 `.env` 文件：

```env
ZEROCLOW_GATEWAY_URL=http://localhost:42617
PORT=3332
ACCESS_KEY=zeroclaw2026
ZEROCLOW_TOKEN=your-token  # 可选
```

## 功能

- 🔐 访问密钥验证
- 💬 实时 WebSocket 流式聊天
- 🎨 日间/夜间主题切换
- 📝 Markdown 消息渲染
- 🛠️ 工具调用可视化
- 💾 会话本地持久化
- 📱 响应式设计

## 架构

```
浏览器 → Node.js (3332) → ZeroClaw Gateway (42617)
         (WebSocket 代理)
```

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express (ES Module) |
| WebSocket | ws 库（内部代理） |
| 前端 | Bootstrap 5 + 原生 JavaScript |
| Markdown | marked.js |

## 许可证

MIT
