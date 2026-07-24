# ZeroClaw Web Chat 功能复刻计划

## 概述

本计划将 zeroclaw-web-chat 复刻为 companion-app 的外观和交互体验，分5个阶段实施，排除需要深度架构适配的功能（记忆系统、语义召回、自动提取、参考文档RAG、配额监控、心跳系统）。

## 架构保持

- 保持 WebSocket 代理模式不变
- 保持 Express + ES Modules 技术栈
- 保持 Access Key 认证机制
- 保持会话记录双格式（.md + .json）
- **必要时可引入 npm 依赖**，避免重复造轮子

## ⚠️ 重要约束：资源本地化

**所有 CSS、JS、图标、字体等资源文件必须本地化，禁止引用在线 CDN。**

- ❌ 不得引用 `jsDelivr`、`unpkg`、`cdnjs` 等在线资源
- ❌ 不得使用 `<link href="https://...">` 或 `<script src="https://...">` 引用外部文件
- ✅ 所有资源文件必须放在 `public/` 目录下
- ✅ 可从 companion-app 项目复制资源文件（`/home/zemi/MyDev/companion-app/public/`）

**当前需要移除的在线引用**:
- Bootstrap CSS（`cdn.jsdelivr.net/npm/bootstrap`）
- Bootstrap Icons（`cdn.jsdelivr.net/npm/bootstrap-icons`）

**替换方案**:
- 从 companion-app 复制暖色调 CSS 设计系统
- 使用本地 SVG 图标（内联或单独文件）

---

## Phase 1: UI 重构（2-3天）

### 目标
- 重构为 5标签页导航结构
- 应用暖色调设计系统
- 实现响应式布局

### 任务清单

#### 1.1 HTML 结构重构
**文件**: `public/index.html`

- [ ] 添加侧边栏导航（桌面端）
- [ ] 添加底部标签栏（移动端）
- [ ] 创建 5个内容区域：私聊、群聊、控制台、记忆、设置
- [ ] 每个区域独立容器，通过 JS切换显示

**HTML 结构**:
```html
<div class="app">
  <!-- 桌面侧边栏 -->
  <aside class="sidebar">
    <div class="brand">Claw Agent</div>
    <nav class="nav-tabs">
      <button data-tab="chat">私聊</button>
      <button data-tab="group">群聊</button>
      <button data-tab="console">控制台</button>
      <button data-tab="memory">记忆</button>
      <button data-tab="settings">设置</button>
    </nav>
    <div class="sidebar-footer">...</div>
  </aside>

  <!-- 主内容区 -->
  <main class="main-content">
    <div id="tab-chat" class="tab-panel active">...</div>
    <div id="tab-group" class="tab-panel">...</div>
    <div id="tab-console" class="tab-panel">...</div>
    <div id="tab-memory" class="tab-panel">...</div>
    <div id="tab-settings" class="tab-panel">...</div>
  </main>

  <!-- 移动端底部标签栏 -->
  <nav class="mobile-tabs">...</nav>
</div>
```

#### 1.2 CSS 设计系统
**文件**: `public/css/style.css`

- [ ] 定义 32+ CSS 自定义属性（设计令牌）
- [ ] 实现暖色调主题（奶油白/暖深色）
- [ ] 移除 Bootstrap 依赖，全部自定义样式

**设计令牌**:
```css
:root {
  /* 背景色 */
  --bg: #f7f0e6;
  --bg-soft: #f0e8db;
  --panel: #ffffff;
  --panel-2: #f5efe5;

  /* 文字色 */
  --text: #2c2420;
  --muted: #8a7e74;
  --faint: #b5a99a;

  /* 边框色 */
  --line: #e5ddd3;
  --line-soft: #efe7dd;

  /* 强调色 */
  --accent: #6fb1ff;
  --accent-strong: #4a9aff;
  --accent-soft: rgba(111, 177, 255, 0.15);

  /* 气泡色 */
  --me-bubble: #6fb1ff;
  --me-bubble-ink: #ffffff;
  --them-bubble: #f5efe5;
  --them-bubble-ink: #2c2420;

  /* 圆角 */
  --radius: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
}
```

**暗色主题**:
```css
body[data-theme="dark"] {
  --bg: #1f1b17;
  --bg-soft: #2a2520;
  --panel: #302b25;
  --panel-2: #3a342d;
  --text: #f0e8db;
  --muted: #a89a8a;
  --faint: #7a6e62;
  --line: #4a4035;
  --line-soft: #3a342d;
  --them-bubble: #3a342d;
  --them-bubble-ink: #f0e8db;
}
```

#### 1.3 响应式布局
**文件**: `public/css/style.css`

- [ ] 桌面端（>1100px）：260px 侧边栏 + flex 主区域
- [ ] 平板端（481-1100px）：底部标签栏，隐藏侧边栏
- [ ] 手机端（<480px）：隐藏头像，调整气泡宽度

**断点实现**:
```css
/* 桌面端 */
@media (min-width: 1101px) {
  .sidebar { width: 260px; }
  .mobile-tabs { display: none; }
}

/* 平板端 */
@media (max-width: 1100px) {
  .sidebar { display: none; }
  .mobile-tabs { display: flex; }
  .main-content { padding-bottom: 60px; }
}

/* 手机端 */
@media (max-width: 480px) {
  .avatar { display: none; }
  .message { max-width: 88%; }
}
```

#### 1.4 消息气泡样式
**文件**: `public/css/style.css`

- [ ] 用户消息右对齐，蓝色气泡
- [ ] 助手消息左对齐，灰色气泡
- [ ] 显示头像（首字母）、发送者名称、时间戳
- [ ] 思考块特殊样式（斜体灰色）

**气泡结构**:
```html
<div class="message me">
  <div class="avatar">W</div>
  <div class="bubble">
    <div class="sender">Wenyin</div>
    <div class="content">消息内容</div>
    <div class="time">14:30</div>
  </div>
</div>
```

#### 1.5 标签页切换逻辑
**文件**: `public/js/chat.js`

- [ ] 实现标签页切换（显示/隐藏内容区域）
- [ ] 更新导航按钮激活状态
- [ ] 保持聊天状态（切换标签不丢失消息）

**JS 逻辑**:
```javascript
// 标签页切换
function switchTab(tabName) {
  // 隐藏所有面板
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.remove('active');
  });

  // 显示目标面板
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // 更新导航按钮状态
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
}
```

### 验证点
- [ ] 桌面端显示侧边栏，可切换 5个标签
- [ ] 移动端显示底部标签栏，可切换
- [ ] 暖色调主题正确应用
- [ ] 暗色主题可切换
- [ ] 消息气泡样式正确（区分用户/助手）
- [ ] 响应式布局在不同屏幕尺寸下正常
- [ ] **⚠️ 所有 CSS/JS 资源已本地化，无在线 CDN 引用**

---

## Phase 2: 交互增强（2-3天）

### 目标
- 实现消息操作（复制/回复/跳转）
- 实现草稿系统
- 实现聊天搜索
- 添加键盘快捷键
- 实现图片灯箱

### 任务清单

#### 2.1 消息操作菜单
**文件**: `public/js/chat.js`, `public/css/style.css`

- [ ] 消息 hover 显示操作按钮（复制/回复/收藏）
- [ ] 复制功能（clipboard API，降级方案）
- [ ] 回复功能（引用预览）
- [ ] 收藏功能（切换状态，需后端 API）

**HTML 结构**:
```html
<div class="message me">
  <div class="bubble">
    <div class="content">消息内容</div>
    <div class="actions">
      <button class="action-btn" data-action="copy" title="复制">
        <svg>...</svg>
      </button>
      <button class="action-btn" data-action="reply" title="回复">
        <svg>...</svg>
      </button>
      <button class="action-btn" data-action="favorite" title="收藏">
        <svg>...</svg>
      </button>
    </div>
  </div>
</div>
```

**复制逻辑**:
```javascript
async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制');
  } catch {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制');
  }
}
```

#### 2.2 草稿系统
**文件**: `public/js/chat.js`, `public/css/style.css`

- [ ] 多行输入拆分为草稿气泡（Enter 换行，Ctrl+Enter 发送）
- [ ] 草稿气泡显示在输入框上方
- [ ] 每个草稿可单独编辑/删除
- [ ] 草稿文本持久化到 localStorage

**草稿结构**:
```html
<div class="drafts">
  <div class="draft-bubble">
    <span class="draft-text">第一行草稿</span>
    <button class="draft-delete">×</button>
  </div>
  <div class="draft-bubble">
    <span class="draft-text">第二行草稿</span>
    <button class="draft-delete">×</button>
  </div>
</div>
```

**键盘逻辑**:
```javascript
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Enter 发送所有草稿
      sendAllDrafts();
    } else {
      // Enter 添加草稿
      e.preventDefault();
      addDraft();
    }
  }
});
```

#### 2.3 聊天搜索
**文件**: `public/js/chat.js`, `public/css/style.css`

- [ ] 搜索输入框（顶部栏）
- [ ] 实时搜索消息内容（防抖 250ms）
- [ ] 显示匹配数量
- [ ] 点击搜索结果跳转到消息（平滑滚动 + 高亮闪烁）

**搜索逻辑**:
```javascript
function searchMessages(keyword) {
  const results = messages.filter(msg =>
    msg.content.toLowerCase().includes(keyword.toLowerCase())
  );
  renderSearchResults(results);
}

function jumpToMessage(messageId) {
  const element = document.querySelector(`[data-message-id="${messageId}"]`);
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.classList.add('flash');
  setTimeout(() => element.classList.remove('flash'), 1500);
}
```

**闪烁动画**:
```css
@keyframes flashBubble {
  0% { box-shadow: 0 0 0 0 var(--accent-soft); }
  20% { box-shadow: 0 0 12px 4px var(--accent-soft); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.message.flash {
  animation: flashBubble 1.5s ease-out;
}
```

#### 2.4 键盘快捷键
**文件**: `public/js/chat.js`

- [ ] 修改发送键为 Ctrl+Enter / Cmd+Enter
- [ ] Enter 键添加草稿
- [ ] Shift+Enter 换行
- [ ] Escape 关闭灯箱/搜索

**事件监听**:
```javascript
document.addEventListener('keydown', (e) => {
  // Escape 关闭弹窗
  if (e.key === 'Escape') {
    closeLightbox();
    closeSearch();
  }
});
```

#### 2.5 图片灯箱
**文件**: `public/js/chat.js`, `public/css/style.css`

- [ ] 点击图片全屏查看
- [ ] 显示文件名和"查看原图"链接
- [ ] 点击外部/ESC/关闭按钮退出
- [ ] 淡入动画

**HTML 结构**:
```html
<div class="lightbox" id="lightbox">
  <div class="lightbox-overlay"></div>
  <div class="lightbox-content">
    <button class="lightbox-close">×</button>
    <img src="..." alt="...">
    <div class="lightbox-info">
      <span class="filename">image.jpg</span>
      <a href="..." target="_blank">查看原图</a>
    </div>
  </div>
</div>
```

**CSS 动画**:
```css
@keyframes lightbox-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lightbox.active {
  animation: lightbox-in 0.16s ease-out;
}
```

#### 2.6 收藏功能（后端 API）
**文件**: `server.js`（或 `routes/api.js`）

- [ ] `POST /api/messages/:id/favorite` — 切换收藏状态
- [ ] `GET /api/messages/favorites` — 获取收藏列表
- [ ] 消息数据添加 `favorite` 字段

**API 设计**:
```javascript
// 切换收藏
app.post('/api/messages/:id/favorite', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  // 查找消息并切换收藏状态
  // 返回更新后的消息
});

// 获取收藏列表
app.get('/api/messages/favorites', requireVerifiedSession, (req, res) => {
  // 返回所有收藏的消息
});
```

### 验证点
- [ ] 消息 hover 显示操作按钮
- [ ] 复制功能正常（HTTPS/非 HTTPS）
- [ ] 回复功能显示引用预览
- [ ] 收藏功能可切换状态
- [ ] 草稿系统：Enter 添加草稿，Ctrl+Enter 发送
- [ ] 草稿持久化（刷新页面不丢失）
- [ ] 搜索功能：实时搜索，点击跳转
- [ ] 图片灯箱：点击全屏，ESC 关闭
- [ ] 键盘快捷键：Ctrl+Enter 发送

---

## Phase 3: 后端功能（3-4天）

### 目标
- 实现设置面板
- 实现贴纸系统
- 实现控制台基础版
- 实现会话清理（/forge）

### 任务清单

#### 3.1 设置面板
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

**前端**:
- [ ] 设置表单：用户名、助手名、主题选择
- [ ] 认证管理：重置 Token 按钮
- [ ] 通知开关（浏览器通知权限）

**后端 API**:
- [ ] `GET /api/settings` — 获取设置
- [ ] `PUT /api/settings` — 更新设置
- [ ] `POST /api/auth/reset` — 重置认证 Token

**设置数据结构**:
```json
{
  "userName": "Wenyin",
  "assistantName": "Claw Agent",
  "theme": "light",
  "notifications": true
}
```

#### 3.2 贴纸系统
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

**前端**:
- [ ] 贴纸面板（可切换显示/隐藏）
- [ ] 贴纸列表（网格布局）
- [ ] 上传贴纸按钮
- [ ] 点击贴纸发送
- [ ] 编辑模式（删除贴纸）

**后端 API**:
- [ ] `GET /api/stickers` — 获取贴纸列表
- [ ] `POST /api/stickers` — 上传贴纸
- [ ] `DELETE /api/stickers/:id` — 删除贴纸

**贴纸数据结构**:
```json
{
  "id": "sticker-1",
  "url": "/uploads/stickers/xxx.png",
  "createdAt": "2026-07-24T..."
}
```

#### 3.3 控制台
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

**前端**:
- [ ] 事件列表（时间线样式，左侧彩色边框）
- [ ] 事件类型：system、error、reply、upload、command
- [ ] 命令输入框 + 快捷按钮（/forge、/help 等）
- [ ] 自动滚动到底部

**后端 API**:
- [ ] `GET /api/console/events` — 获取事件列表
- [ ] `POST /api/console/command` — 执行命令
- [ ] 事件存储（内存或文件）

**事件数据结构**:
```json
{
  "id": "event-1",
  "type": "system",
  "title": "系统启动",
  "body": "服务器已启动，端口 3332",
  "timestamp": "2026-07-24T..."
}
```

#### 3.4 会话清理（/forge）
**文件**: `routes/api.js`

- [ ] `POST /api/sessions/forge` — 清理会话历史
- [ ] 保留用户/助手消息，移除工具调用/思考块
- [ ] 插入分隔符消息
- [ ] 返回清理后的会话 ID

**API 设计**:
```javascript
app.post('/api/sessions/forge', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.body;

  // 1. 读取现有消息
  // 2. 过滤：保留 user/assistant 文本消息
  // 3. 插入分隔符
  // 4. 保存到新文件
  // 5. 返回新会话 ID
});
```

#### 3.5 群聊功能（可选）
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

- [ ] 群聊标签页独立消息列表
- [ ] @提及触发 AI 回复
- [ ] 群聊消息格式：`sender: content`

### 验证点
- [ ] 设置面板：可修改用户名/助手名/主题
- [ ] 设置持久化（刷新后保持）
- [ ] 贴纸系统：上传/发送/删除
- [ ] 控制台：显示事件，可执行命令
- [ ] /forge 命令：清理历史，插入分隔符
- [ ] 群聊（可选）：@提及触发回复

---

## Phase 4: 高级功能（2-3天）

### 目标
- 实现 SSE 实时更新
- 实现基础记忆系统（日记+词法召回）
- 实现参考文档（基础版）

### 任务清单

#### 4.1 SSE 实时更新
**文件**: `routes/api.js`, `public/js/chat.js`

**后端**:
- [ ] `GET /api/stream` — SSE 端点
- [ ] 事件类型：ready、snapshot、message、settings
- [ ] 心跳：每 25秒发送 ping
- [ ] 广播：新消息/设置变更时通知所有客户端

**前端**:
- [ ] EventSource 连接
- [ ] 状态指示器：live / connecting / reconnecting
- [ ] 自动重连
- [ ] 增量消息渲染（避免全量重绘）

**SSE 实现**:
```javascript
// 后端
app.get('/api/stream', requireVerifiedSession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 发送初始快照
  res.write(`event: snapshot\ndata: ${JSON.stringify(getSnapshot())}\n\n`);

  // 心跳
  const heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 25000);

  // 清理
  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// 前端
const eventSource = new EventSource('/api/stream');
eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  appendMessage(data);
});
```

#### 4.2 基础记忆系统
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

**前端**:
- [ ] 记忆列表（卡片样式，可展开/折叠）
- [ ] 创建记忆表单（标题、内容、标签）
- [ ] 编辑/删除记忆
- [ ] 置顶功能
- [ ] 搜索记忆

**后端 API**:
- [ ] `GET /api/memories` — 获取记忆列表
- [ ] `POST /api/memories` — 创建记忆
- [ ] `PUT /api/memories/:id` — 更新记忆
- [ ] `DELETE /api/memories/:id` — 删除记忆
- [ ] `POST /api/memories/:id/pin` — 切换置顶

**记忆数据结构**:
```json
{
  "id": "mem-1",
  "title": "用户偏好",
  "content": "喜欢简洁的代码风格",
  "tags": ["偏好", "代码"],
  "pinned": false,
  "createdAt": "2026-07-24T...",
  "updatedAt": "2026-07-24T..."
}
```

#### 4.3 词法召回
**文件**: `routes/api.js`

- [ ] 分词：中文按字符，英文按空格
- [ ] 停用词过滤
- [ ] 计算 token 重叠度
- [ ] 返回相关记忆（top 8）

**召回逻辑**:
```javascript
function lexicalRecall(query, memories) {
  const queryTokens = tokenize(query);
  const scored = memories.map(mem => {
    const memTokens = tokenize(mem.content);
    const overlap = queryTokens.filter(t => memTokens.includes(t)).length;
    return { ...mem, score: overlap };
  });
  return scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
```

#### 4.4 参考文档（基础版）
**文件**: `public/index.html`, `public/js/chat.js`, `routes/api.js`

**前端**:
- [ ] 文档列表（标题、大小、操作）
- [ ] 上传文档（txt, md, json, csv）
- [ ] 查看文档内容（展开/折叠）
- [ ] 删除文档

**后端 API**:
- [ ] `GET /api/documents` — 获取文档列表
- [ ] `POST /api/documents` — 上传文档
- [ ] `GET /api/documents/:id` — 获取文档内容
- [ ] `DELETE /api/documents/:id` — 删除文档

**文档数据结构**:
```json
{
  "id": "doc-1",
  "title": "README.md",
  "content": "...",
  "size": 1234,
  "chunks": [...],
  "createdAt": "2026-07-24T..."
}
```

### 验证点
- [ ] SSE 连接：状态指示器显示 live
- [ ] SSE 重连：断开后自动重连
- [ ] 新消息通过 SSE 实时推送
- [ ] 记忆系统：CRUD 功能正常
- [ ] 词法召回：搜索返回相关记忆
- [ ] 参考文档：上传/查看/删除

---

## Phase 5: 优化完善（2-3天）

### 目标
- 实现 PWA 支持
- 实现系统通知
- 添加动画效果
- 性能优化

### 任务清单

#### 5.1 PWA 支持
**文件**: `public/sw.js`, `public/manifest.json`

**Service Worker**:
- [ ] 缓存静态资源：HTML、CSS、JS、图标
- [ ] 不缓存 API 请求
- [ ] 离线时显示缓存页面

**Manifest**:
```json
{
  "name": "Claw Agent",
  "short_name": "Claw",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#6fb1ff",
  "background_color": "#f7f0e6",
  "icons": [
    { "src": "/favicon/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### 5.2 系统通知
**文件**: `public/js/chat.js`

- [ ] 请求通知权限
- [ ] 后台收到消息时发送通知
- [ ] 通知点击聚焦窗口
- [ ] 通知开关（设置面板）

**实现**:
```javascript
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function sendNotification(title, body) {
  if (document.hidden && notificationsEnabled) {
    new Notification(title, {
      body: body.substring(0, 100),
      icon: '/favicon/icon-192.png'
    });
  }
}
```

#### 5.3 动画效果
**文件**: `public/css/style.css`

- [ ] 消息入场动画（淡入+上滑）
- [ ] 贴纸悬停效果（缩放）
- [ ] 按钮点击反馈（下沉）
- [ ] 输入框聚焦光环

**CSS 动画**:
```css
@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message {
  animation: messageIn 0.2s ease-out;
}

.sticker:hover {
  transform: scale(1.12);
}

.sticker:active {
  transform: scale(0.9);
}

button:active {
  transform: translateY(0.5px);
}

.composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}
```

#### 5.4 性能优化
**文件**: `public/js/chat.js`

- [ ] 消息列表虚拟滚动（超过 100条时）
- [ ] 图片懒加载
- [ ] 搜索防抖优化
- [ ] DOM 操作批量更新

#### 5.5 边缘情况处理
**文件**: `public/js/chat.js`

- [ ] 离线状态：禁用发送按钮，显示提示
- [ ] 连接断开：自动重连，显示状态
- [ ] 消息发送失败：显示重试按钮
- [ ] 空状态：无消息时显示引导

### 验证点
- [ ] PWA：可添加到主屏幕
- [ ] 离线：缓存页面可访问
- [ ] 通知：后台消息触发通知
- [ ] 动画：消息入场/贴纸悬停/按钮点击
- [ ] 性能：大量消息不卡顿
- [ ] 边缘情况：离线/断开/失败处理

---

## 文件改动清单

### 新增文件
```
public/
├── sw.js                    # Service Worker
├── manifest.json            # PWA 配置
└── favicon/
    ├── icon-192.png
    └── icon-512.png
```

### 修改文件
```
public/
├── index.html               # HTML 结构重构
├── css/
│   └── style.css            # 全新设计系统
└── js/
    └── chat.js              # 前端逻辑重构

server.js                    # 添加新 API 端点
routes/
└── api.js                   # 扩展 API 路由
```

### 数据存储扩展
```
data/
├── settings.json            # 用户设置
├── stickers/                # 贴纸图片
├── memories.json            # 记忆数据
├── documents/               # 参考文档
└── console-events.json      # 控制台事件
```

---

## 技术约束

### 保持不变
- ✅ Express + ES Modules
- ✅ WebSocket 代理模式
- ✅ Access Key 认证
- ✅ 会话记录双格式
- ✅ 文件系统存储

### 新增依赖
- ✅ **必要时可引入 npm 依赖**，但应优先考虑：
  - 是否有成熟稳定的库可用
  - 是否避免重复造轮子
  - 是否保持轻量级（避免引入大型框架）
- ❌ 不引入前端框架（React/Vue/Angular 等）
- ✅ 优先使用原生 JS + CSS
- ✅ 可考虑引入的依赖示例：
  - `marked` — Markdown 渲染（如需更强大功能）
  - `highlight.js` — 代码高亮
  - `dompurify` — XSS 防护
  - `uuid` — 生成唯一 ID
  - `date-fns` — 日期格式化（轻量级）

### 资源文件引用
- ❌ **禁止引用在线 CDN 资源**（如 jsDelivr、unpkg、cdnjs 等）
- ❌ **禁止引用外部 CSS/JS 文件链接**
- ✅ **所有资源文件必须本地化**
- ✅ **从 companion-app 项目复制资源文件**（图标、字体、样式等）
- ✅ **本地资源目录结构**:
  ```
  public/
  ├── css/           # 本地 CSS 文件
  ├── js/            # 本地 JS 文件
  ├── fonts/         # 本地字体文件（如有）
  ├── icons/         # 本地 SVG 图标
  └── favicon/       # 本地 favicon
  ```

**可从 companion-app 复制的资源**:
- `/home/zemi/MyDev/companion-app/public/styles.css` — 暖色调设计系统
- `/home/zemi/MyDev/companion-app/public/app.js` — 前端逻辑参考
- `/home/zemi/MyDev/companion-app/public/index.html` — HTML 结构参考
- SVG 图标（内联到 HTML 或单独文件）

### 浏览器兼容
- ✅ 现代浏览器（Chrome 90+、Firefox 90+、Safari 15+）
- ✅ 移动端浏览器
- ✅ PWA 支持

---

## 验收标准

### 功能完整性
- [ ] 5个标签页可正常切换
- [ ] 消息操作（复制/回复/收藏/跳转）
- [ ] 草稿系统可正常工作
- [ ] 聊天搜索可跳转
- [ ] 设置面板可保存
- [ ] 贴纸系统可上传/发送
- [ ] 控制台显示事件
- [ ] 记忆系统可 CRUD
- [ ] SSE 实时更新
- [ ] PWA 可安装

### UI/UX 一致性
- [ ] 暖色调设计（奶油白/暖深色）
- [ ] 响应式布局（桌面/平板/手机）
- [ ] 动画效果流畅
- [ ] 与 companion-app 视觉风格一致
- [ ] **⚠️ 所有资源本地化，无在线 CDN 引用**

### 性能指标
- [ ] 首屏加载 < 2秒
- [ ] 消息发送延迟 < 100ms
- [ ] 搜索响应 < 200ms
- [ ] 支持 1000+ 消息不卡顿

---

## 风险评估

### 低风险
- UI 重构（纯前端）
- 消息操作（纯前端）
- 动画效果（渐进增强）

### 中风险
- SSE 实现（需要测试重连）
- 贴纸系统（文件上传）
- 记忆系统（数据一致性）

### 高风险
- 无（已排除架构适配功能）

---

## 时间估算

| 阶段 | 时间 | 累计 |
|------|------|------|
| Phase 1: UI 重构 | 2-3天 | 3天 |
| Phase 2: 交互增强 | 2-3天 | 6天 |
| Phase 3: 后端功能 | 3-4天 | 10天 |
| Phase 4: 高级功能 | 2-3天 | 13天 |
| Phase 5: 优化完善 | 2-3天 | 16天 |

**总计**: 11-16天（约 2-3周）

---

## 后续扩展（可选）

完成本计划后，可考虑：
1. 记忆系统增强：语义召回、自动提取
2. 配额监控：对接 Gateway API
3. 心跳系统：定时 AI 主动消息
4. 群聊增强：多人协作
5. 会话导出：PDF/Markdown 格式

---

*计划生成时间: 2026-07-24*
*版本: 1.0*
