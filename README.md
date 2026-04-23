# ZeroClaw Web Chat

轻量的 ZeroClaw AI Gateway Web 聊天界面（Bootstrap 5 + Node.js）。

## 30 秒上手

```bash
npm install
npm start
```

打开 `http://localhost:3332`，输入 `.env` 中的 `ACCESS_KEY` 登录即可。
- 默认密钥：`zeroclaw2026`（仅开发使用，生产必须替换）

## 环境变量（`.env`）

```env
ZEROCLOW_GATEWAY_URL=http://localhost:42617
PORT=3332
ACCESS_KEY=replace-with-strong-key
ZEROCLOW_TOKEN=your-token                  # 可选
SESSION_TTL_MS=43200000                    # 可选，默认 12 小时
ALLOWED_ORIGINS=http://localhost:3332      # 可选，逗号分隔
VERIFY_MAX_ATTEMPTS=10                     # 可选
VERIFY_WINDOW_MS=600000                    # 可选（10 分钟）
VERIFY_BLOCK_MS=900000                     # 可选（15 分钟）
```

## 核心功能

- 访问密钥验证与会话鉴权
- WebSocket 流式聊天（代理转发）
- Markdown 渲染与深浅色主题
- 登录限流、防注入、CORS 白名单

## 架构

```text
浏览器 → Node.js (3332) → ZeroClaw Gateway (42617)
         (WebSocket 代理)
```

## 许可证

Apache License Version 2.0
