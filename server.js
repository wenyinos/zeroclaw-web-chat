import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// 配置
const PORT = process.env.PORT || 3332;
const GATEWAY_URL = process.env.ZEROCLOW_GATEWAY_URL || 'http://localhost:8190';
const TOKEN = process.env.ZEROCLOW_TOKEN;
const ACCESS_KEY = process.env.ACCESS_KEY || 'zeroclaw2026'; // 默认访问密钥

// 简单的会话存储（内存中）
const sessions = new Map();

// 生成会话 ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// API 路由 - 获取配置
app.get('/api/config', (req, res) => {
  res.json({
    gatewayUrl: GATEWAY_URL,
    token: TOKEN ? '****' : null,
  });
});

// API 路由 - 验证访问密钥
app.post('/api/verify', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ success: false, message: '缺少密钥' });
  }
  
  if (key === ACCESS_KEY) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { verified: true, timestamp: Date.now() });
    return res.json({ success: true, sessionId });
  }
  
  res.status(401).json({ success: false, message: '密钥无效' });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 ZeroClaw Web Chat 已启动`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`🔑 访问密钥: 已启用 (环境变量 ACCESS_KEY)`);
  console.log(`© ZeroClaw - AI Assistant Web Interface`);
});

export { app, server };
