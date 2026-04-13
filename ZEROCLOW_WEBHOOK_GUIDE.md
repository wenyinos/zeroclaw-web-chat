# ZeroClaw Webhook 配置指南

本文档详细说明如何在 ZeroClaw 中配置 Webhook 渠道，实现通过 HTTP POST 接收消息并自动回复。

## 什么是 Webhook 渠道？

Webhook 渠道是 ZeroClaw 的"通用适配器"，允许任何支持 Webhook 的系统与 Agent 通信：

- **接收消息**: 通过 HTTP POST 接收外部系统的消息
- **发送回复**: 将 Agent 的回复 POST/PUT 到指定的回调 URL
- **签名验证**: 支持 HMAC-SHA256 签名验证，确保请求来源可信

---

## 配置方法

### 基础配置

编辑 `~/.zeroclaw/config.toml`，添加 `[channels.webhook]` 部分：

```toml
[channels.webhook]
# 是否启用此渠道（必须设为 true）
enabled = true

# 监听端口（用于接收外部 POST 请求）
port = 8190

# 监听路径（默认 /webhook）
listen_path = "/webhook"

# 可选：回复消息的回调 URL
# 如果配置，Agent 的回复会 POST 到此 URL
send_url = "https://your-server.com/callback"

# 可选：HTTP 方法（POST 或 PUT，默认 POST）
send_method = "POST"

# 可选：认证头（用于 outbound 请求）
auth_header = "Bearer your-api-token"

# 可选：签名验证密钥（HMAC-SHA256）
secret = "your-shared-secret"
```

---

## 配置项说明

| 配置项 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | ✅ | `false` | 是否启用此渠道 |
| `port` | ✅ | 无 | 监听端口（接收 POST 请求） |
| `listen_path` | 否 | `"/webhook"` | 监听路径 |
| `send_url` | 否 | 无 | Agent 回复的回调 URL |
| `send_method` | 否 | `"POST"` | 回调 HTTP 方法（POST/PUT） |
| `auth_header` | 否 | 无 | 回调请求的 Authorization 头 |
| `secret` | 否 | 无 | HMAC-SHA256 签名密钥 |

---

## 使用场景

### 场景 1: 仅接收消息（单向）

只接收外部消息，不需要回调：

```toml
[channels.webhook]
enabled = true
port = 8190
listen_path = "/webhook"
```

**测试**:
```bash
curl -X POST http://localhost:8190/webhook \
  -H "Content-Type: application/json" \
  -d '{"sender": "user123", "content": "你好，请帮我分析这段日志"}'
```

---

### 场景 2: 双向通信（带回调）

接收消息并将回复发送到指定 URL：

```toml
[channels.webhook]
enabled = true
port = 8190
listen_path = "/webhook"
send_url = "https://your-app.com/zeroclaw/callback"
send_method = "POST"
auth_header = "Bearer your-callback-token"
```

**消息流转**:
```
外部系统 ─POST─→ Gateway /webhook
                  ↓
              Agent 处理
                  ↓
Gateway ─POST─→ send_url (你的回调)
```

---

### 场景 3: 启用签名验证（生产环境推荐）

确保请求来源可信：

```toml
[channels.webhook]
enabled = true
port = 8190
listen_path = "/webhook"
secret = "my-super-secret-key"
```

**生成签名（示例 - Node.js）**:
```javascript
const crypto = require('crypto');

const secret = 'my-super-secret-key';
const body = JSON.stringify({
  sender: 'user123',
  content: '你好'
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

console.log('X-Webhook-Secret:', signature);
```

**发送带签名的请求**:
```bash
curl -X POST http://localhost:8190/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <生成的签名>" \
  -d '{"sender": "user123", "content": "你好"}'
```

---

## 消息格式

### 接收消息（POST 到 /webhook）

**请求格式**:
```json
{
  "sender": "user123",
  "content": "你好，请帮我分析这段日志",
  "thread_id": "optional-thread-id"
}
```

| 字段 | 必需 | 说明 |
|------|------|------|
| `sender` | ✅ | 发送者标识（任意字符串） |
| `content` | ✅ | 消息内容 |
| `thread_id` | 否 | 线程/会话 ID（用于多轮对话） |

**成功响应**:
```
HTTP 200 OK
```

**错误响应**:
```json
// 400 - 请求格式错误
{"error": "Invalid JSON body. Expected: {\"message\": \"...\"}"}

// 401 - 认证失败
{"error": "Unauthorized — invalid or missing X-Webhook-Secret header"}

// 429 - 频率限制
{"error": "Too many webhook requests. Please retry later.", "retry_after": 60}
```

---

### 发送回复（从 send_url 回调）

**回调格式**:
```json
{
  "content": "这是 Agent 的回复内容",
  "thread_id": "optional-thread-id",
  "recipient": "user123"
}
```

| 字段 | 说明 |
|------|------|
| `content` | Agent 回复内容 |
| `thread_id` | 原始 thread_id（如果提供） |
| `recipient` | 原始 sender（如果不为空） |

---

## 与 Gateway 认证配合

如果你的 Gateway 启用了配对认证（`require_pairing = true`）：

### 方法 1: 在 Webhook 请求中携带 Token

```bash
curl -X POST http://localhost:8190/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PAIRING_TOKEN" \
  -d '{"sender": "user123", "content": "你好"}'
```

### 方法 2: 使用独立的 Webhook Secret

```toml
[gateway]
require_pairing = true  # Gateway 配对认证

[channels.webhook]
enabled = true
port = 8190
secret = "webhook-only-secret"  # Webhook 独立密钥
```

---

## 高级配置

### 频率限制

Webhook 请求受 Gateway 频率限制：

```toml
[gateway]
# Webhook 每分钟最大请求数（默认 60）
webhook_rate_limit_per_minute = 100
```

### 幂等性（防止重复处理）

使用 `X-Idempotency-Key` 头防止重复：

```bash
curl -X POST http://localhost:8190/webhook \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: unique-request-id-123" \
  -d '{"sender": "user123", "content": "你好"}'
```

**配置**:
```toml
[gateway]
# 幂等键 TTL（秒，默认 300）
idempotency_ttl_secs = 600

# 最大幂等键数量
idempotency_max_keys = 20000
```

---

## 完整示例

### 示例 1: 与自定义系统集成

```toml
# ~/.zeroclaw/config.toml

[gateway]
port = 42617
host = "127.0.0.1"
require_pairing = false

[channels.webhook]
enabled = true
port = 42617  # 与 Gateway 同端口
listen_path = "/webhook"
send_url = "http://localhost:3000/zeroclaw/callback"
auth_header = "Bearer callback-secret-token"
secret = "webhook-hmac-secret"
```

**你的后端代码（Express.js 示例）**:
```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// 接收 Agent 回复的回调端点
app.post('/zeroclaw/callback', (req, res) => {
  const { content, thread_id, recipient } = req.body;
  
  console.log(`收到回复 from ${recipient}: ${content}`);
  
  // 处理回复（存储、转发等）
  res.status(200).send('OK');
});

app.listen(3000, () => {
  console.log('Callback server running on port 3000');
});
```

**发送消息到 ZeroClaw**:
```javascript
const secret = 'webhook-hmac-secret';
const body = JSON.stringify({
  sender: 'user-001',
  content: '请帮我写一段 Python 代码'
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

fetch('http://localhost:42617/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': signature
  },
  body: body
});
```

---

### 示例 2: 与 CI/CD 集成

```toml
[channels.webhook]
enabled = true
port = 42617
listen_path = "/ci-webhook"
send_url = "https://ci-server.example.com/notify"
auth_header = "Bearer ci-notification-token"
```

**GitHub Actions 示例**:
```yaml
- name: Notify ZeroClaw
  run: |
    curl -X POST https://zeroclaw.example.com/ci-webhook \
      -H "Content-Type: application/json" \
      -d '{
        "sender": "github-actions",
        "content": "构建完成，请分析构建日志",
        "thread_id": "${{ github.run_id }}"
      }'
```

---

## 故障排除

### 问题 1: 404 Not Found

**症状**: POST /webhook 返回 404

**原因**: 渠道未启用或路径错误

**解决方案**:
```bash
# 1. 检查配置
cat ~/.zeroclaw/config.toml | grep -A 10 '\[channels.webhook\]'

# 2. 确认 enabled = true
# 3. 检查路径是否正确
```

---

### 问题 2: 401 Unauthorized

**症状**: 返回 401 错误

**原因**: 签名验证失败或缺少认证

**解决方案**:
```bash
# 方案 A: 暂时禁用签名验证（测试用）
[channels.webhook]
secret = ""  # 清空密钥

# 方案 B: 正确生成签名
# 使用上面的签名生成脚本
```

---

### 问题 3: 429 Too Many Requests

**症状**: 请求被限流

**解决方案**:
```toml
[gateway]
# 增加限制
webhook_rate_limit_per_minute = 200
```

---

### 问题 4: Agent 无回复

**症状**: 消息发送成功，但 Agent 没有回复

**检查清单**:
```bash
# 1. 查看 Gateway 日志
zeroclaw gateway --verbose

# 2. 检查 Agent 配置
zeroclaw status

# 3. 测试直接对话
zeroclaw chat
```

---

## Webhook 与 WebSocket 对比

| 特性 | Webhook | WebSocket |
|------|---------|-----------|
| **通信方式** | HTTP POST | 持久连接 |
| **实时性** | 依赖回调 | 实时双向 |
| **适用场景** | 事件驱动、异步 | 实时聊天 |
| **复杂度** | 简单（HTTP） | 中等（WS 协议） |
| **回调需求** | 可选 | 不需要 |
| **签名验证** | ✅ HMAC-SHA256 | ✅ Bearer Token |

**选择建议**:
- 📱 **实时聊天**: 使用 WebSocket（`/ws/chat`）
- 🔔 **事件通知/集成**: 使用 Webhook（`/webhook`）
- 🔄 **两者结合**: Webhook 接收事件，WebSocket 实时对话

---

## 环境变量覆盖

也可以通过环境变量配置 Webhook：

```bash
# Webhook 签名密钥
export ZEROCLAW_WEBHOOK_SECRET=my-secret

# 启动 Gateway
zeroclaw gateway
```

> ⚠️ 环境变量优先级高于 `config.toml`。

---

## 更多信息

- Gateway 源码: `crates/zeroclaw-gateway/src/lib.rs`
- Webhook 渠道实现: `crates/zeroclaw-channels/src/webhook.rs`
- 配置结构: `crates/zeroclaw-config/src/schema.rs` (WebhookConfig)
