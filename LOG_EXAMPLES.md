# ZeroClaw Web Chat 日志输出示例

本文档展示浏览器控制台中会输出的 Gateway 连接相关日志。

## 连接成功示例

```
════════════════════════════════════════════════════════════
🔌 [WebSocket] 正在连接到 ZeroClaw Gateway
════════════════════════════════════════════════════════════
📍 Gateway 地址: http://localhost:42617
🔗 WebSocket URL: ws://localhost:42617/ws/chat?session_id=abc123
📡 协议: zeroclaw.v1
🆔 Session ID: abc123-def456-ghi789
🔑 Token: 未配置
────────────────────────────────────────────────────────────
✅ [WebSocket] 连接已成功建立
📊 连接信息:
   - URL: ws://localhost:42617/ws/chat?session_id=abc123
   - 协议: 
   - 状态: OPEN
════════════════════════════════════════════════════════════
📨 [Gateway] 会话启动
   - Session ID: abc123-def456-ghi789
   - 会话名称: 未命名
   - 是否恢复: 否
   - 历史消息数: 0
   - Gateway URL: http://localhost:42617
```

## 发送消息示例

```
📤 [Gateway] 发送消息
   - 内容长度: 12 字符
   - 内容预览: 你好，请介绍一下你的能力
   - WebSocket 状态: OPEN

🤖 [Gateway] Agent 启动
   - Provider: openrouter
   - Model: anthropic/claude-sonnet-4

📨 [WebSocket] 收到事件: thinking

🔄 [Gateway] 重置流式缓冲区

✅ [Gateway] 消息完成
   - 内容长度: 156 字符
   - 思考长度: 45 字符

🏁 [Gateway] Agent 完成
   - Provider: openrouter
   - Model: anthropic/claude-sonnet-4
```

## 工具调用示例

```
📤 [Gateway] 发送消息
   - 内容长度: 25 字符
   - 内容预览: 请帮我查看当前目录的文件结构
   - WebSocket 状态: OPEN

🔧 [Gateway] 工具调用: shell
   - 参数: {
  "command": "ls -la"
}

✅ [Gateway] 工具结果
   - 输出长度: 523 字符
   - 输出预览: total 48
drwxr-xr-x  10 user user  4096 Apr 13 10:00 .
drwxr-x...

✅ [Gateway] 消息完成
   - 内容长度: 89 字符
   - 思考长度: 0 字符
```

## 连接失败示例

```
════════════════════════════════════════════════════════════
🔌 [WebSocket] 正在连接到 ZeroClaw Gateway
════════════════════════════════════════════════════════════
📍 Gateway 地址: http://localhost:42617
🔗 WebSocket URL: ws://localhost:42617/ws/chat?session_id=abc123
📡 协议: zeroclaw.v1
🆔 Session ID: abc123-def456-ghi789
🔑 Token: 未配置
────────────────────────────────────────────────────────────
════════════════════════════════════════════════════════════
❌ [WebSocket] 连接错误
📍 目标 URL: ws://localhost:42617/ws/chat?session_id=abc123
🔍 错误详情: Event {isTrusted: true, type: 'error', ...}
💡 可能原因:
   1. Gateway 未启动或端口错误
   2. 网络连接问题
   3. CORS 配置问题
════════════════════════════════════════════════════════════
────────────────────────────────────────────────────────────
❌ [WebSocket] 连接已关闭
📊 关闭信息:
   - Code: 1006 异常断开
   - Reason: 无
   -  Was Clean: false
────────────────────────────────────────────────────────────
🔄 [WebSocket] 将在 3 秒后尝试重连...

🔄 [WebSocket] 正在重连...
```

## 认证错误示例

```
📨 [WebSocket] 收到事件: error {
  type: "error",
  code: "AUTH_ERROR",
  message: "Unauthorized — provide Authorization header..."
}

❌ [Gateway] 服务器错误
   - 错误代码: AUTH_ERROR
   - 错误消息: Unauthorized — provide Authorization header, Sec-WebSocket-Protocol bearer, or ?token= query param
   - Gateway URL: http://localhost:42617
```

## 配置更新示例

```
⚙️ [Gateway] 配置已更新
   - Gateway URL: http://localhost:42617 → http://localhost:8190
   - Token: (未配置) → (已配置)
   - 正在重新连接...

────────────────────────────────────────────────────────────
❌ [WebSocket] 连接已关闭
📊 关闭信息:
   - Code: 1000 正常关闭
   - Reason: 无
   -  Was Clean: true
────────────────────────────────────────────────────────────

════════════════════════════════════════════════════════════
🔌 [WebSocket] 正在连接到 ZeroClaw Gateway
════════════════════════════════════════════════════════════
📍 Gateway 地址: http://localhost:8190
🔗 WebSocket URL: ws://localhost:8190/ws/chat?session_id=abc123&token=***
📡 协议: zeroclaw.v1, bearer.my-token
🆔 Session ID: abc123-def456-ghi789
🔑 Token: 已配置 (my-token...)
────────────────────────────────────────────────────────────
✅ [WebSocket] 连接已成功建立
...
```

## 日志标签说明

| 标签 | 说明 |
|------|------|
| `🔌 [WebSocket]` | WebSocket 连接相关事件 |
| `📨 [Gateway]` | 接收来自 Gateway 的消息 |
| `📤 [Gateway]` | 发送到 Gateway 的消息 |
| `🤖 [Gateway]` | Agent 生命周期事件 |
| `🔧 [Gateway]` | 工具调用事件 |
| `✅ [Gateway]` | 成功事件 |
| `❌ [Gateway]` | 错误事件 |
| `🔄 [Gateway]` | 重连/重置事件 |
| `⚙️ [Gateway]` | 配置变更事件 |

## 如何查看日志

1. 打开浏览器开发者工具（F12）
2. 切换到 "Console"（控制台）标签
3. 刷新页面或执行操作
4. 查看带 Gateway 标签的日志输出

## 故障排查提示

如果看到连接错误日志，请检查：

1. **Gateway 是否运行**: `zeroclaw gateway status`
2. **端口是否正确**: 检查 `.env` 中的 `ZEROCLOW_GATEWAY_URL`
3. **认证配置**: 如果启用了 `require_pairing`，需要提供 token
4. **CORS 配置**: 确保 Gateway 允许跨域请求（如果是远程访问）
