import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { log, LOG_FILE } from './lib/logger.js';
import { router as apiRouter, validateAccessKey } from './routes/api.js';
import { setupWsProxy } from './lib/ws-proxy.js';
import { startSessionCleanup } from './lib/sessions.js';
import { startRateLimiterCleanup } from './lib/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（强制覆盖系统环境变量）
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

// 验证 ACCESS_KEY
validateAccessKey();

// 配置
const PORT = process.env.PORT || 3332;
const GATEWAY_URL = process.env.ZEROCLOW_GATEWAY_URL || 'http://localhost:8190';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = express();
const server = createServer(app);

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));
// 默认上限 100KB 不够：贴纸 2MB、图片消息、文档都以 base64/长文本走 JSON body
app.use(express.json({ limit: '5mb' }));
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

// 挂载 API 路由
app.use(apiRouter);

// 贴纸静态文件服务
const STICKERS_DIR = path.join(__dirname, 'data', 'stickers');
app.use('/stickers', express.static(STICKERS_DIR, {
  maxAge: '1d',
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  log('error', `未处理的错误: ${err.message}\n${err.stack}`);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// WebSocket 代理
setupWsProxy(server);

// 启动定时清理任务
startSessionCleanup();
startRateLimiterCleanup();

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
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
