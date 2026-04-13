# ZeroClaw WebSocket 对接指南

本文档详细说明如何通过 WebSocket 与 ZeroClaw Agent 进行通信。

## 连接信息

### WebSocket 端点

```
ws://<host>:<port>/ws/chat?session_id=<ID>&name=<SessionName>&token=<TOKEN>
```

**默认地址**: `ws://localhost:8190/ws/chat`

### 查询参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `session_id` | 否 | 会话 UUID，不提供则自动生成 |
| `name` | 否 | 会话名称（用于持久化显示） |
| `token` | 否 | 认证令牌（如果 Gateway 启用了认证） |

## 认证方式

支持三种认证方式（按优先级）：

### 1. Authorization Header

```http
Authorization: Bearer <token>
```

### 2. Sec-WebSocket-Protocol

```javascript
const ws = new WebSocket(url, ['zeroclaw.v1', `bearer.${token}`]);
```

### 3. URL Query 参数

```
ws://localhost:8190/ws/chat?token=YOUR_TOKEN
```

> **注意**: 如果 Gateway 配置为无需认证（本地开发），可省略 token。

## 消息协议

### 客户端 → 服务端

#### 发送聊天消息

```json
{
  "type": "message",
  "content": "你好，请帮我分析这个日志文件"
}
```

#### 可选握手（向后兼容）

连接后可选发送：

```json
{
  "type": "connect",
  "session_id": "optional-override-uuid",
  "device_name": "My Device",
  "capabilities": ["streaming", "canvas"]
}
```

服务端响应：

```json
{
  "type": "connected",
  "message": "Connection established"
}
```

### 服务端 → 客户端

#### 会话启动通知（连接后立即推送）

```json
{
  "type": "session_start",
  "session_id": "abc-123-def",
  "name": "My Session",
  "resumed": true,
  "message_count": 42
}
```

| 字段 | 说明 |
|------|------|
| `resumed` | 是否为恢复的会话（存在历史记录） |
| `message_count` | 历史消息数量 |

#### Agent 生命周期事件

```json
{"type": "agent_start", "provider": "openrouter", "model": "anthropic/claude-sonnet-4"}
{"type": "agent_end", "provider": "openrouter", "model": "anthropic/claude-sonnet-4"}
```

#### 思考过程

```json
{
  "type": "thinking",
  "content": "让我先查看日志的关键部分..."
}
```

#### 流式消息片段

```json
{
  "type": "chunk",
  "content": "根据日志分析，"
}
```

#### 工具调用

```json
{
  "type": "tool_call",
  "name": "shell",
  "args": {
    "command": "cat /var/log/syslog | tail -50"
  }
}
```

#### 工具执行结果

```json
{
  "type": "tool_result",
  "name": "shell",
  "output": "Apr 13 10:30:01 server systemd[1]: Started..."
}
```

#### 消息完成

```json
{
  "type": "chunk_reset"
}
```

```json
{
  "type": "done",
  "full_response": "根据日志分析，系统运行正常。没有发现错误。"
}
```

> **重要**: `chunk_reset` 表示客户端应清除流式缓冲区，`done` 中的 `full_response` 是完整权威回复。

#### 错误通知

```json
{
  "type": "error",
  "message": "API key is invalid",
  "code": "AUTH_ERROR"
}
```

**错误代码**:

| 代码 | 说明 |
|------|------|
| `AUTH_ERROR` | 认证失败 |
| `PROVIDER_ERROR` | 模型/提供商错误 |
| `AGENT_ERROR` | Agent 执行错误 |
| `INVALID_JSON` | JSON 格式错误 |
| `UNKNOWN_MESSAGE_TYPE` | 不支持的消息类型 |
| `EMPTY_CONTENT` | 空内容 |
| `SESSION_BUSY` | 会话正在处理其他请求 |

## 完整消息流转示例

```
客户端                              ZeroClaw Gateway
  │                                       │
  │  WebSocket 握手                        │
  │  GET /ws/chat?session_id=xxx          │
  │ ────────────────────────────────────> │
  │                                       │
  │  {"type":"session_start",             │
  │   "session_id":"xxx",                 │
  │   "resumed":false,"message_count":0}  │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"message",                   │
  │   "content":"帮我分析日志"}             │
  │ ────────────────────────────────────> │
  │                                       │
  │  {"type":"agent_start",               │
  │   "provider":"openrouter",...}        │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"thinking",                  │
  │   "content":"正在读取日志..."}          │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"chunk","content":"日志显示"}  │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"tool_call",                 │
  │   "name":"shell","args":{...}}        │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"tool_result",               │
  │   "name":"shell","output":"..."}      │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"chunk_reset"}               │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"done",                      │
  │   "full_response":"系统在10:30..."}   │
  │ <─────────────────────────────────── │
  │                                       │
  │  {"type":"agent_end",...}             │
  │ <─────────────────────────────────── │
```

## 代码示例

### JavaScript (浏览器)

```javascript
const sessionId = crypto.randomUUID();
const token = "your_token"; // 可选

const ws = new WebSocket(
  `ws://localhost:8190/ws/chat?session_id=${sessionId}&token=${token}`,
  ['zeroclaw.v1', `bearer.${token}`]
);

ws.onopen = () => {
  console.log('✅ 已连接到 ZeroClaw Gateway');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'session_start':
      console.log(`📋 会话: ${msg.session_id}`);
      console.log(`📜 恢复: ${msg.resumed}, 历史消息: ${msg.message_count}`);
      break;
      
    case 'agent_start':
      console.log(`🤖 Agent 启动: ${msg.provider}/${msg.model}`);
      break;
      
    case 'thinking':
      console.log(`💭 思考: ${msg.content}`);
      // 更新 UI 中的思考过程区域
      break;
      
    case 'chunk':
      process.stdout.write(msg.content);
      // 流式追加消息内容
      break;
      
    case 'tool_call':
      console.log(`🔧 调用工具: ${msg.name}(${JSON.stringify(msg.args)})`);
      // 显示工具调用卡片
      break;
      
    case 'tool_result':
      console.log(`✅ 工具结果: ${msg.output}`);
      // 更新工具执行状态
      break;
      
    case 'chunk_reset':
      // 清除流式缓冲区
      console.log('🔄 重置流式缓冲区');
      break;
      
    case 'done':
      console.log(`\n✅ 回复完成: ${msg.full_response}`);
      // 渲染最终消息（支持 Markdown）
      break;
      
    case 'agent_end':
      console.log('🏁 Agent 完成');
      break;
      
    case 'error':
      console.error(`❌ 错误 [${msg.code}]: ${msg.message}`);
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket 错误:', error);
};

ws.onclose = (event) => {
  console.log(`连接已关闭: code=${event.code}, reason=${event.reason}`);
  // 3 秒后自动重连（非正常关闭时）
  if (event.code !== 1000) {
    setTimeout(connect, 3000);
  }
};

// 发送消息
function sendMessage(content) {
  ws.send(JSON.stringify({
    type: 'message',
    content: content
  }));
}
```

### Node.js

```javascript
import WebSocket from 'ws';

const sessionId = crypto.randomUUID();
const token = process.env.ZEROCLOW_TOKEN;

const ws = new WebSocket(
  `ws://localhost:8190/ws/chat?session_id=${sessionId}`,
  {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  }
);

ws.on('open', () => {
  console.log('✅ 已连接');
  
  // 发送消息
  ws.send(JSON.stringify({
    type: 'message',
    content: '你好！'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('收到消息:', msg.type, msg);
});

ws.on('error', (error) => {
  console.error('错误:', error);
});

ws.on('close', (code, reason) => {
  console.log(`关闭: code=${code}, reason=${reason.toString()}`);
});
```

### Python

```python
import asyncio
import json
import uuid
import websockets

async def chat_with_agent():
    session_id = str(uuid.uuid4())
    token = "your_token"  # 可选
    
    uri = f"ws://localhost:8190/ws/chat?session_id={session_id}&token={token}"
    
    async with websockets.connect(uri) as ws:
        # 等待 session_start
        while True:
            msg = json.loads(await ws.recv())
            print(f"收到: {msg['type']}", json.dumps(msg, indent=2))
            if msg['type'] == 'session_start':
                break
        
        # 发送消息
        await ws.send(json.dumps({
            "type": "message",
            "content": "你好，请介绍一下你的能力"
        }))
        
        # 接收流式响应
        full_response = []
        while True:
            msg = json.loads(await ws.recv())
            
            if msg['type'] == 'chunk':
                full_response.append(msg['content'])
                print(msg['content'], end='', flush=True)
            elif msg['type'] == 'thinking':
                print(f"\n[思考] {msg['content']}")
            elif msg['type'] == 'tool_call':
                print(f"\n[工具] {msg['name']}: {msg['args']}")
            elif msg['type'] == 'tool_result':
                print(f"\n[结果] {msg['output']}")
            elif msg['type'] == 'done':
                print(f"\n\n[完成] {msg['full_response']}")
                break
            elif msg['type'] == 'error':
                print(f"\n[错误] {msg['code']}: {msg['message']}")
                break

asyncio.run(chat_with_agent())
```

## 重要注意事项

### 1. 会话管理

- **Session ID**: 使用固定的 `session_id` 可实现跨连接的历史恢复
- **会话持久化**: Gateway 使用 SQLite 存储会话历史
- **并发控制**: 同一 session 同时只能处理一个 turn，需等待 `done` 后再发下一条消息

### 2. 流式消息处理

```javascript
let buffer = '';

function handleChunk(content) {
  buffer += content;
  updateUI(buffer); // 实时显示
}

function handleChunkReset() {
  buffer = ''; // 清空缓冲区
}

function handleDone(fullResponse) {
  renderMarkdown(fullResponse); // 渲染最终内容
  buffer = '';
}
```

### 3. 自动重连

```javascript
function connect() {
  ws = new WebSocket(url);
  
  ws.onclose = (event) => {
    if (event.code !== 1000) {
      console.log('3 秒后重连...');
      setTimeout(connect, 3000);
    }
  };
}
```

### 4. 思考过程展示

Thinking 内容可以折叠显示，用户可点击展开查看推理过程：

```html
<details class="thinking-block">
  <summary>💭 思考过程</summary>
  <div class="thinking-content">{thinking_content}</div>
</details>
```

### 5. 工具调用展示

```html
<div class="tool-call-card">
  <div class="tool-name">🔧 {tool_name}</div>
  <pre class="tool-args">{arguments}</pre>
  <div class="tool-status">⏳ 执行中...</div>
</div>
```

## 启动 Gateway

```bash
# 使用默认配置启动
zeroclaw gateway

# 指定端口
zeroclaw gateway start -p 8190

# 查看帮助
zeroclaw gateway --help
```

## 故障排除

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 连接被拒绝 | Gateway 未启动 | 运行 `zeroclaw gateway` |
| 401 Unauthorized | 认证失败 | 检查 token 是否正确 |
| SESSION_BUSY | 会话正在处理请求 | 等待 `done` 后再发送 |
| 连接立即关闭 | 协议不匹配 | 确保使用 `zeroclaw.v1` 子协议 |
| 消息无响应 | WebSocket 未正确连接 | 检查浏览器开发者工具 Console |

## 其他 WebSocket 端点

ZeroClaw 还提供其他 WebSocket 端点：

| 端点 | 功能 |
|------|------|
| `/ws/canvas/{id}` | Live Canvas (A2UI) 实时更新 |
| `/ws/nodes` | 节点发现和注册 |

## 参考资源

- **Gateway 源码**: `crates/zeroclaw-gateway/src/ws.rs`
- **Agent 执行引擎**: `crates/zeroclaw-runtime/src/agent/agent.rs`
- **事件定义**: `crates/zeroclaw-api/src/agent.rs`
