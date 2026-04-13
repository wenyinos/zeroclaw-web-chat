import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

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

// API 路由 - 获取配置
app.get('/api/config', (req, res) => {
  res.json({
    gatewayUrl: GATEWAY_URL,
    token: TOKEN ? '****' : null,
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 ZeroClaw Web Chat 已启动`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`© ZeroClaw - AI Assistant Web Interface`);
});

export { app, server };
