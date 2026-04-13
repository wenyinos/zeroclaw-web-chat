# ZeroClaw Web Chat 接入指南

本文档详细说明如何将 ZeroClaw Web Chat 接入 ZeroClaw Gateway 实现在线聊天。

## 架构概览

```
浏览器 (Web Chat)  ←→  Node.js Server (中转)  ←→  ZeroClaw Gateway (WebSocket)
   http://localhost:3332                           ws://localhost:42617/ws/chat
```

**工作流程**：
1. 用户通过浏览器访问 Web Chat（端口 3332）
2. 输入访问密钥通过验证
3. 前端直接通过 WebSocket 连接到 ZeroClaw Gateway（端口 42617）
4. Gateway 调用 Agent 进行对话

---

## 第一步：配置 ZeroClaw Gateway

### 1.1 编辑配置文件

编辑 ZeroClaw 配置文件 `~/.zeroclaw/config.toml`：

```toml
[gateway]
# 监听端口（默认 42617）
port = 42617

# 监听地址
# 127.0.0.1 - 仅本地访问（推荐，安全）
# 0.0.0.0   - 允许外部访问
host = "127.0.0.1"

# 是否需要配对认证
# true  - 需要通过 /pair 端点获取 token
# false - 无需认证，直接连接（本地开发推荐）
require_pairing = false

# 是否允许公开绑定（host=0.0.0.0 时需设为 true）
allow_public_bind = false

# 会话持久化（保持对话历史）
session_persistence = true
```

### 1.2 启动 Gateway

```bash
# 启动 Gateway
zeroclaw gateway

# 或指定端口
zeroclaw gateway start -p 42617
```

### 1.3 验证 Gateway 运行

```bash
# 检查端口是否监听
lsof -i :42617

# 测试 HTTP 端点
curl http://localhost:42617/health
```

---

## 第二步：配置 Web Chat

### 2.1 创建环境变量文件

```bash
cd /home/zemi/MyDev/zeroclaw-web-chat
cp .env.example .env
```

### 2.2 编辑 `.env` 文件

```env
# ZeroClaw Gateway 地址（必须与 Gateway 配置一致）
ZEROCLOW_GATEWAY_URL=http://localhost:42617

# Web Chat 服务器端口（浏览器访问的端口）
PORT=3332

# 可选：Gateway 认证令牌（如果 gateway 启用了 require_pairing=true）
# ZEROCLOW_TOKEN=your_token_here

# 页面访问密钥（保护 Web Chat 访问）
ACCESS_KEY=zeroclaw2026
```

> ⚠️ **重要**: `ZEROCLOW_GATEWAY_URL` 必须指向你的 Gateway 地址和端口。

### 2.3 安装依赖

```bash
npm install
```

### 2.4 启动 Web Chat

```bash
# 开发模式（文件修改自动重启）
npm run dev

# 或生产模式
npm start
```

---

## 第三步：访问聊天界面

### 3.1 打开浏览器

访问：`http://localhost:3332`

### 3.2 输入访问密钥

输入 `.env` 中配置的 `ACCESS_KEY`（默认：`zeroclaw2026`）

### 3.3 开始对话

连接成功后，即可与 ZeroClaw Agent 进行实时对话。

---

## 连接流程详解

```
1. 浏览器访问 http://localhost:3332
   ↓
2. 输入访问密钥 zeroclaw2026
   ↓
3. Web Chat 前端建立 WebSocket 连接
   ws://localhost:42617/ws/chat?session_id=xxx
   ↓
4. Gateway 返回 session_start 事件
   ↓
5. 用户输入消息 "你好"
   ↓
6. 前端发送: {"type":"message","content":"你好"}
   ↓
7. Gateway 调用 Agent，流式返回：
   - thinking（思考过程）
   - chunk（消息片段）
   - tool_call（工具调用）
   - tool_result（工具结果）
   - done（完成）
   ↓
8. 前端实时渲染，显示完整对话
```

---

## 配置选项说明

### Gateway 配置（config.toml）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `port` | `42617` | WebSocket 服务端口 |
| `host` | `127.0.0.1` | 监听地址 |
| `require_pairing` | `true` | 是否需要 token 认证 |
| `allow_public_bind` | `false` | 是否允许非本地绑定 |
| `session_persistence` | `true` | 是否持久化会话历史 |

### Web Chat 配置（.env）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `ZEROCLOW_GATEWAY_URL` | `http://localhost:8190` | Gateway 地址 |
| `PORT` | `3332` | Web Chat 服务端口 |
| `ACCESS_KEY` | `zeroclaw2026` | Web 页面访问密钥 |
| `ZEROCLOW_TOKEN` | 无 | Gateway 认证令牌（可选） |

---

## 高级配置

### 启用 Gateway 认证

如果需要更高的安全性：

#### 1. 修改 Gateway 配置

```toml
[gateway]
require_pairing = true
```

#### 2. 获取 Token

```bash
# 启动 Gateway 后，通过 /pair 端点获取 token
curl -X POST http://localhost:42617/pair
```

#### 3. 配置 Web Chat

编辑 `.env`：

```env
ZEROCLOW_TOKEN=从_pair端点获取的token
```

#### 4. 重启服务

```bash
# 重启 Gateway
zeroclaw gateway

# 重启 Web Chat
npm start
```

---

### 允许外部访问

如果需要从其他设备访问：

#### 1. 修改 Gateway 配置

```toml
[gateway]
host = "0.0.0.0"
allow_public_bind = true
require_pairing = true  # 强烈建议启用认证
```

#### 2. 修改 Web Chat 配置

```env
ZEROCLOW_GATEWAY_URL=http://你的服务器IP:42617
```

#### 3. 配置防火墙

```bash
# 开放端口
sudo ufw allow 3332/tcp  # Web Chat
sudo ufw allow 42617/tcp # Gateway
```

---

### 使用反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name chat.example.com;

    # Web Chat 前端
    location / {
        proxy_pass http://localhost:3332;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Gateway WebSocket（可选，通过同域名代理）
    location /ws/ {
        proxy_pass http://localhost:42617;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 故障排除

### 问题 1: WebSocket 连接失败

**症状**: 浏览器控制台显示 `WebSocket connection failed`

**解决方案**:
```bash
# 1. 检查 Gateway 是否运行
zeroclaw gateway status

# 2. 检查端口是否监听
lsof -i :42617

# 3. 检查 Gateway 配置
cat ~/.zeroclaw/config.toml | grep -A 10 '\[gateway\]'

# 4. 测试 WebSocket 连接
wscat -c "ws://localhost:42617/ws/chat?session_id=test"
```

---

### 问题 2: 401 Unauthorized

**症状**: 连接被拒绝，提示未授权

**解决方案**:

```bash
# 方案 A: 禁用认证（仅本地开发）
# 编辑 ~/.zeroclaw/config.toml
[gateway]
require_pairing = false

# 方案 B: 提供正确的 token
# 编辑 .env
ZEROCLOW_TOKEN=正确的token
```

---

### 问题 3: 消息发送后无响应

**症状**: 消息已发送，但一直显示"连接中"

**解决方案**:
```bash
# 1. 检查 Agent 配置（模型提供商是否可用）
zeroclaw status

# 2. 查看 Gateway 日志
zeroclaw gateway --verbose

# 3. 检查浏览器控制台错误
# F12 > Console 查看错误信息
```

---

### 问题 4: CORS 错误

**症状**: 浏览器提示 CORS 策略阻止

**解决方案**:

Web Chat 通过 Node.js 中转静态文件，CORS 已配置。如果是自定义部署：

```javascript
// server.js 中已包含
app.use(cors());
```

---

## 验证连接

### 快速测试

```bash
# 使用 wscat 测试 WebSocket 连接
echo '{"type":"message","content":"你好"}' | \
  wscat -c "ws://localhost:42617/ws/chat?session_id=test-123" -w 2
```

**预期输出**:
```json
{"type":"session_start","session_id":"test-123","resumed":false,"message_count":0}
{"type":"agent_start","provider":"openrouter","model":"anthropic/claude-sonnet-4"}
{"type":"thinking","content":"让我思考一下..."}
{"type":"chunk","content":"你好！"}
{"type":"done","full_response":"你好！有什么可以帮助你的？"}
```

---

## 项目文件说明

| 文件 | 作用 |
|------|------|
| `server.js` | Node.js 后端，提供静态文件和 API |
| `public/index.html` | 前端页面 |
| `public/js/chat.js` | WebSocket 连接和聊天逻辑 |
| `public/css/style.css` | 样式表 |
| `.env` | 环境变量配置 |

**核心连接代码**（`chat.js` 第 164-193 行）:

```javascript
connect() {
    const wsUrl = this.gatewayUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams();
    params.set('session_id', this.sessionId);
    if (this.token) {
        params.set('token', this.token);
    }

    const url = `${wsUrl}/ws/chat?${params.toString()}`;
    const protocols = ['zeroclaw.v1'];
    if (this.token) {
        protocols.push(`bearer.${this.token}`);
    }

    this.ws = new WebSocket(url, protocols);
    // ...
}
```

---

## 完整启动顺序

```bash
# 1. 启动 ZeroClaw Gateway
zeroclaw gateway

# 等待 Gateway 启动完成...

# 2. 启动 Web Chat
cd /home/zemi/MyDev/zeroclaw-web-chat
npm start

# 3. 访问浏览器
# http://localhost:3332
# 输入密钥: zeroclaw2026
```

---

## 性能优化建议

1. **启用会话持久化**: 保持 `session_persistence = true` 可跨连接保留历史
2. **设置会话 TTL**: 自动清理过期会话
   ```toml
   [gateway]
   session_ttl_hours = 24  # 24 小时后自动清理
   ```
3. **使用生产模式**: 使用 `npm start` 而非 `npm run dev`
4. **配置反向代理缓存**: 减少静态资源加载时间

---

## 安全建议

1. ✅ 修改默认 `ACCESS_KEY` 为强密钥
2. ✅ 生产环境启用 `require_pairing = true`
3. ✅ 使用 HTTPS + WSS（通过反向代理）
4. ✅ 限制 Gateway `host` 为 `127.0.0.1`
5. ✅ 定期更新 ZeroClaw 版本

---

## 更多信息

- WebSocket 协议详情: 查看 `WEBSOCKET_GUIDE.md`
- ZeroClaw 配置文档: 查看 ZeroClaw 官方文档
- 问题反馈: https://github.com/wenyinos/zeroclaw-web-chat/issues
