# ZeroClaw Web Chat - 快速使用指南

## 📦 项目结构

```
web-chat/
├── server.js              # Node.js Express 服务器
├── package.json           # 项目配置和依赖
├── .env.example          # 环境变量示例
├── .gitignore            # Git 忽略文件
├── start.sh              # 快速启动脚本
├── README.md             # 详细文档
└── public/               # 前端静态文件
    ├── index.html        # 主页面
    ├── css/
    │   └── style.css    # Bootstrap 自定义样式
    └── js/
        └── chat.js      # 聊天核心逻辑
```

## 🚀 快速启动（3 步）

### 1️⃣ 启动 ZeroClaw Gateway

在 zeroclaw 目录运行：
```bash
cd /home/zemi/MyDev/zeroclaw
zeroclaw gateway
```

确保 gateway 在 `http://localhost:8190` 运行。

### 2️⃣ 启动 Web Chat

在 web-chat 目录运行：
```bash
cd /home/zemi/MyDev/zeroclaw-web-chat

# 方式 1: 使用启动脚本
./start.sh

# 方式 2: 使用 npm
npm start

# 方式 3: 开发模式（自动重启）
npm run dev
```

### 3️⃣ 打开浏览器

访问 **http://localhost:3332**

## 💡 使用技巧

### 聊天操作
- ✉️ **发送消息**: 输入文字后按 `Enter`
- ↩️ **换行**: 按 `Shift + Enter`
- 🗑️ **清空对话**: 点击右上角垃圾桶图标
- ⚙️ **设置**: 点击右上角齿轮图标

### 设置说明
点击齿轮图标可以修改：
- **Gateway 地址**: 如果 zeroclaw 运行在其他地址
- **认证令牌**: 如果 gateway 需要认证

### 消息类型

#### 1. 普通消息
直接显示在聊天窗口，支持 Markdown 格式。

#### 2. 思考过程
AI 的思考过程会显示为黄色卡片，可折叠查看。

#### 3. 工具调用
当 AI 执行操作时，会显示蓝色工具卡片：
- 🔧 工具名称
- 📝 调用参数
- ✅ 执行结果

## 🎨 界面说明

### 连接状态指示器
- 🟢 **绿色**: 已连接，可以聊天
- 🔴 **红色**: 未连接，检查 gateway

### 消息气泡
- 🔵 **蓝色（右侧）**: 你的消息
- ⚪ **灰色（左侧）**: AI 回复
- 🟡 **黄色**: AI 思考过程
- 🔷 **蓝色卡片**: 工具调用

## ⚙️ 配置选项

### 环境变量（可选）

创建 `.env` 文件：
```env
# Gateway 地址
ZEROCLOW_GATEWAY_URL=http://localhost:8190

# Web Chat 端口
PORT=3332

# 认证令牌（如果需要）
# ZEROCLOW_TOKEN=your_token
```

## 🔧 故障排除

### 问题 1: 连接失败
**症状**: 状态显示"已断开"

**解决方法**:
1. 确认 gateway 正在运行: `zeroclaw gateway`
2. 检查地址是否正确（默认 `http://localhost:8190`）
3. 查看浏览器控制台错误信息

### 问题 2: 消息发送失败
**症状**: 发送消息无响应

**解决方法**:
1. 检查连接状态（看状态灯颜色）
2. 刷新页面重新连接
3. 检查 gateway 日志

### 问题 3: 样式加载失败
**症状**: 界面丑陋或布局错误

**解决方法**:
1. 确保网络连接正常（需要加载 CDN）
2. 清除浏览器缓存
3. 或使用本地 Bootstrap 文件

## 📊 功能清单

### ✅ 已实现
- [x] WebSocket 实时通信
- [x] 流式消息渲染
- [x] 思考过程显示
- [x] 工具调用可视化
- [x] Markdown 渲染
- [x] 会话持久化
- [x] 自动重连
- [x] 响应式设计
- [x] 设置面板
- [x] 清空对话

### 🚧 计划中
- [ ] 多会话管理
- [ ] 消息搜索
- [ ] 文件上传
- [ ] 语音输入
- [ ] 主题切换

## 🤝 贡献

有问题或建议？欢迎：
- 🐛 提交 Issue
- 💡 提出建议
- 🔧 提交 PR

## 📝 许可证

MIT License
