import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 日志配置
const LOG_FILE = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// 日志工具函数
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  // 输出到控制台
  if (level === 'error') {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }
  
  // 输出到文件
  logStream.write(logMessage);
}

const app = express();
const server = createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log('info', `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

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
  log('info', '返回 Gateway 配置信息');
  res.json({
    gatewayUrl: GATEWAY_URL,
    token: TOKEN ? '****' : null,
  });
});

// API 路由 - 验证访问密钥
app.post('/api/verify', (req, res) => {
  const { key } = req.body;

  if (!key) {
    log('warn', '验证请求缺少密钥');
    return res.status(400).json({ success: false, message: '缺少密钥' });
  }

  if (key === ACCESS_KEY) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { verified: true, timestamp: Date.now() });
    log('info', `验证成功，会话 ID: ${sessionId}`);
    return res.json({ success: true, sessionId });
  }

  log('warn', `验证失败: 密钥无效 (${key.substring(0, 3)}***)`);
  res.status(401).json({ success: false, message: '密钥无效' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  log('error', `未处理的错误: ${err.message}\n${err.stack}`);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// 启动服务器
server.listen(PORT, () => {
  log('info', '🚀 ZeroClaw Web Chat 已启动');
  log('info', `📍 访问地址: http://localhost:${PORT}`);
  log('info', `🔗 Gateway: ${GATEWAY_URL}`);
  log('info', `🔑 访问密钥: 已启用 (环境变量 ACCESS_KEY)`);
  log('info', `📝 日志文件: ${LOG_FILE}`);
  log('info', '© ZeroClaw - AI Assistant Web Interface');
});

// 优雅关闭
process.on('SIGTERM', () => {
  log('info', '收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    log('info', '服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', '收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    log('info', '服务器已关闭');
    process.exit(0);
  });
});

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  log('error', `未捕获的异常: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', `未处理的 Promise 拒绝: ${reason}`);
});

export { app, server };
