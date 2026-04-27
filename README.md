# ZeroClaw Web Chat

ZeroClaw AI Gateway 的轻量 Web 聊天界面（Bootstrap 5 + Node.js）。

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

## 环境变量（`.env`）

```env
ZEROCLOW_GATEWAY_URL=http://localhost:42617
PORT=3332
ACCESS_KEY=replace-with-strong-key
ZEROCLOW_TOKEN=your-token             # 可选
SESSION_TTL_MS=43200000               # 可选，默认 12 小时
ALLOWED_ORIGINS=http://localhost:3332 # 可选，逗号分隔
VERIFY_MAX_ATTEMPTS=10                # 可选
VERIFY_WINDOW_MS=600000               # 可选（10 分钟）
VERIFY_BLOCK_MS=900000                # 可选（15 分钟）
```

## 核心功能

- 访问密钥验证与服务端会话鉴权
- WebSocket 流式聊天（`/ws/chat` 代理到 Gateway）
- Markdown 渲染、深浅色主题
- 会话记录自动保存为 `chat_records/<sessionId>.md`
- 会话记录弹窗支持查看、刷新、下载（下载入口已合并到“会话记录”）
- 下载内容仅保留对话正文（用户/助手），过滤工具调用和调试信息
- 聊天区宽度随页面自适应，字体与间距优化以提升同屏信息密度
- 页面非活动导致断线时，前端会自动守护并重连

## 安全说明

- 登录接口带失败限流与临时封禁。
- `/api/execute` 仅允许白名单命令并阻断注入字符。
- 建议配置 `ALLOWED_ORIGINS` 并使用强密钥。

## 许可证

Apache License Version 2.0
