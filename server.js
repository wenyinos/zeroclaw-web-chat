import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import WebSocket, { WebSocketServer } from 'ws';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（强制覆盖系统环境变量）
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

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
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));
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
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const VERIFY_MAX_ATTEMPTS = Number(process.env.VERIFY_MAX_ATTEMPTS || 10);
const VERIFY_WINDOW_MS = Number(process.env.VERIFY_WINDOW_MS || 10 * 60 * 1000);
const VERIFY_BLOCK_MS = Number(process.env.VERIFY_BLOCK_MS || 15 * 60 * 1000);
const CHAT_RECORDS_DIR = path.join(__dirname, 'chat_records');

// 简单的会话存储（内存中）
const sessions = new Map();
const verifyAttempts = new Map();

// 生成会话 ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (!session?.verified || now - session.timestamp > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

function isSessionValid(sessionId) {
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session?.verified) return false;
  if (Date.now() - session.timestamp > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

function getHeaderValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getClientIp(req) {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwardedFor && typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function normalizeIp(ip) {
  return ip.startsWith('::ffff:') ? ip.substring(7) : ip;
}

function verifyKeyMatch(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function validateAccessKeyStrength(key) {
  return key.length >= 12 && /[A-Za-z]/.test(key) && /\d/.test(key);
}

function cleanupVerifyAttempts() {
  const now = Date.now();
  for (const [ip, info] of verifyAttempts.entries()) {
    const expiredWindow = now - info.windowStart > VERIFY_WINDOW_MS;
    const expiredBlock = !info.blockUntil || now > info.blockUntil;
    if (expiredWindow && expiredBlock) {
      verifyAttempts.delete(ip);
    }
  }
}

function getVerifyState(ip) {
  const info = verifyAttempts.get(ip);
  const now = Date.now();

  if (!info) {
    return {
      blocked: false,
      blockRemainingMs: 0,
      blockedUntil: null,
      remainingAttempts: VERIFY_MAX_ATTEMPTS,
      windowResetAt: null
    };
  }

  if (info.blockUntil && now >= info.blockUntil) {
    verifyAttempts.delete(ip);
    return {
      blocked: false,
      blockRemainingMs: 0,
      blockedUntil: null,
      remainingAttempts: VERIFY_MAX_ATTEMPTS,
      windowResetAt: null
    };
  }

  if (now - info.windowStart > VERIFY_WINDOW_MS && !info.blockUntil) {
    verifyAttempts.delete(ip);
    return {
      blocked: false,
      blockRemainingMs: 0,
      blockedUntil: null,
      remainingAttempts: VERIFY_MAX_ATTEMPTS,
      windowResetAt: null
    };
  }

  const blocked = Boolean(info.blockUntil && now < info.blockUntil);
  const blockRemainingMs = blocked ? info.blockUntil - now : 0;
  const usedAttempts = Math.max(0, info.count || 0);
  const remainingAttempts = blocked ? 0 : Math.max(0, VERIFY_MAX_ATTEMPTS - usedAttempts);
  const windowResetAt = new Date(info.windowStart + VERIFY_WINDOW_MS).toISOString();

  return {
    blocked,
    blockRemainingMs,
    blockedUntil: blocked ? new Date(info.blockUntil).toISOString() : null,
    remainingAttempts,
    windowResetAt
  };
}

function registerVerifyFailure(ip) {
  const now = Date.now();
  const existing = verifyAttempts.get(ip);
  if (!existing || now - existing.windowStart > VERIFY_WINDOW_MS) {
    verifyAttempts.set(ip, { count: 1, windowStart: now, blockUntil: 0 });
    return;
  }

  existing.count += 1;
  if (existing.count >= VERIFY_MAX_ATTEMPTS) {
    existing.blockUntil = now + VERIFY_BLOCK_MS;
    existing.count = 0;
    existing.windowStart = now;
  }
}

function clearVerifyAttempts(ip) {
  verifyAttempts.delete(ip);
}

function ensureChatRecordsDir() {
  if (!fs.existsSync(CHAT_RECORDS_DIR)) {
    fs.mkdirSync(CHAT_RECORDS_DIR, { recursive: true });
  }
}

function sanitizeSessionId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) return '';
  return trimmed;
}

function formatDateTimeText(value) {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(value);
  }
}

function escapeMarkdown(text) {
  return String(text ?? '').replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

function buildSessionMarkdown(sessionId, messages) {
  const lines = [];

  messages.forEach((message) => {
    // 过滤工具调用及其调试输出，仅保留真实对话
    if (message?.toolCall) return;

    const rawRole = String(message?.role || '').toLowerCase();
    const roleLabel = rawRole === 'user' ? '用户' : '助手';
    const content = String(message?.content || '').trim();
    if (!content) return;

    // 过滤前端注入的工具执行摘要提示
    if (/^工具\s+`.+`\s+执行完成，输出\s+\d+\s+字符。$/.test(content)) {
      return;
    }

    lines.push(`## ${roleLabel}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  });

  return lines.join('\n').trim();
}

function requireVerifiedSession(req, res, next) {
  cleanupExpiredSessions();
  const sessionId = getHeaderValue(req.headers['x-session-id']);
  if (!isSessionValid(sessionId)) {
    return res.status(401).json({ success: false, error: '未授权或会话已过期' });
  }
  next();
}

setInterval(cleanupExpiredSessions, Math.min(SESSION_TTL_MS, 30 * 60 * 1000)).unref();
setInterval(cleanupVerifyAttempts, Math.min(VERIFY_WINDOW_MS, 10 * 60 * 1000)).unref();

if (process.env.NODE_ENV === 'production' && !validateAccessKeyStrength(ACCESS_KEY)) {
  throw new Error('生产环境 ACCESS_KEY 强度不足：至少 12 位且包含字母与数字');
}
if (ACCESS_KEY === 'zeroclaw2026') {
  log('warn', '检测到默认 ACCESS_KEY，建议尽快在 .env 中替换');
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
  const clientIp = normalizeIp(getClientIp(req));
  const verifyState = getVerifyState(clientIp);

  if (verifyState.blocked) {
    const seconds = Math.ceil(verifyState.blockRemainingMs / 1000);
    log('warn', `验证请求被限流: ${clientIp}, remaining=${seconds}s`);
    res.set('Retry-After', String(seconds));
    return res.status(429).json({
      success: false,
      message: `尝试次数过多，请 ${seconds} 秒后再试`,
      retryAfterSeconds: seconds,
      blockedUntil: verifyState.blockedUntil,
      remainingAttempts: 0
    });
  }

  if (!key) {
    log('warn', '验证请求缺少密钥');
    return res.status(400).json({ success: false, message: '缺少密钥' });
  }

  if (verifyKeyMatch(key, ACCESS_KEY)) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { verified: true, timestamp: Date.now() });
    clearVerifyAttempts(clientIp);
    log('info', `验证成功，会话 ID: ${sessionId}`);
    return res.json({ success: true, sessionId, expiresInMs: SESSION_TTL_MS });
  }

  registerVerifyFailure(clientIp);
  const updatedState = getVerifyState(clientIp);
  if (updatedState.blocked) {
    const seconds = Math.ceil(updatedState.blockRemainingMs / 1000);
    log('warn', `验证失败后触发限流封禁: ${clientIp}, remaining=${seconds}s`);
    res.set('Retry-After', String(seconds));
    return res.status(429).json({
      success: false,
      message: `尝试次数过多，请 ${seconds} 秒后再试`,
      retryAfterSeconds: seconds,
      blockedUntil: updatedState.blockedUntil,
      remainingAttempts: 0
    });
  }

  log('warn', '验证失败: 密钥无效');
  res.status(401).json({
    success: false,
    message: '密钥无效',
    remainingAttempts: updatedState.remainingAttempts,
    windowResetAt: updatedState.windowResetAt
  });
});

// API 路由 - 执行 shell 命令
app.post('/api/execute', requireVerifiedSession, (req, res) => {
  const { command } = req.body;

  if (!command) {
    log('warn', '执行请求缺少命令');
    return res.status(400).json({ success: false, error: '缺少命令' });
  }

  if (typeof command !== 'string') {
    return res.status(400).json({ success: false, error: '命令格式无效' });
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return res.status(400).json({ success: false, error: '命令为空' });
  }

  // 拒绝 shell 元字符，避免拼接和注入
  if (/[|&;<>`$\\\n\r]/.test(trimmedCommand)) {
    log('warn', `拒绝执行命令（疑似注入）: ${trimmedCommand}`);
    return res.status(403).json({
      success: false,
      error: '命令包含不允许的字符'
    });
  }

  const parts = trimmedCommand.split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);
  const allowedCommandArgs = new Map([
    ['uname', [[], ['-a']]],
    ['hostname', [[]]],
    ['uptime', [[]]],
    ['df', [[], ['-h'], ['-h', '/']]],
    ['free', [[], ['-h']]],
    ['whoami', [[]]],
    ['date', [[]]],
    ['id', [[]]],
    ['pwd', [[]]]
  ]);

  const allowedArgsList = allowedCommandArgs.get(binary);
  const isAllowed = allowedArgsList?.some((allowedArgs) => {
    return allowedArgs.length === args.length && allowedArgs.every((arg, index) => arg === args[index]);
  });

  if (!isAllowed) {
    log('warn', `拒绝执行命令: ${command}`);
    return res.status(403).json({ 
      success: false, 
      error: '命令不被允许，仅允许受限的系统信息查询命令'
    });
  }

  // 执行命令
  log('info', `执行命令: ${binary} ${args.join(' ')}`.trim());
  
  execFile(binary, args, { timeout: 10000, maxBuffer: 50000, shell: false }, (error, stdout, stderr) => {
    if (error) {
      log('error', `命令执行失败: ${error.message}`);
      return res.json({ 
        success: false, 
        error: error.message,
        output: stderr || stdout
      });
    }
    
    const output = stdout || stderr;
    log('info', `命令执行成功，输出: ${output.length} 字符`);
    res.json({ success: true, output: output.trim() });
  });
});

app.post('/api/sessions/save', requireVerifiedSession, (req, res) => {
  const { sessionId, messages } = req.body || {};
  const safeSessionId = sanitizeSessionId(sessionId);
  if (!safeSessionId) {
    return res.status(400).json({ success: false, error: '无效的 sessionId' });
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: 'messages 必须是数组' });
  }

  const normalizedMessages = messages
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      role: item.role,
      content: item.content,
      thinking: item.thinking,
      timestamp: item.timestamp,
      toolCall: item.toolCall
    }));

  ensureChatRecordsDir();
  const filePath = path.join(CHAT_RECORDS_DIR, `${safeSessionId}.md`);
  const markdown = buildSessionMarkdown(safeSessionId, normalizedMessages);
  fs.writeFileSync(filePath, markdown, 'utf8');

  const stat = fs.statSync(filePath);
  return res.json({
    success: true,
    sessionId: safeSessionId,
    fileName: `${safeSessionId}.md`,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size
  });
});

app.get('/api/sessions', requireVerifiedSession, (req, res) => {
  ensureChatRecordsDir();
  const files = fs.readdirSync(CHAT_RECORDS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const filePath = path.join(CHAT_RECORDS_DIR, name);
      const stat = fs.statSync(filePath);
      return {
        sessionId: name.replace(/\.md$/i, ''),
        fileName: name,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return res.json({ success: true, sessions: files });
});

app.get('/api/sessions/:sessionId', requireVerifiedSession, (req, res) => {
  const safeSessionId = sanitizeSessionId(req.params.sessionId);
  if (!safeSessionId) {
    return res.status(400).json({ success: false, error: '无效的 sessionId' });
  }

  ensureChatRecordsDir();
  const filePath = path.join(CHAT_RECORDS_DIR, `${safeSessionId}.md`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '记录不存在' });
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return res.json({
    success: true,
    sessionId: safeSessionId,
    fileName: `${safeSessionId}.md`,
    updatedAt: stat.mtime.toISOString(),
    content
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  log('error', `未处理的错误: ${err.message}\n${err.stack}`);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// WebSocket 代理
const gatewayWsUrl = GATEWAY_URL.replace(/^http/, 'ws');
log('info', `🔄 WebSocket 代理: 将 /ws/chat 代理到 ${gatewayWsUrl}/ws/chat`);

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ noServer: true });
const WS_KEEPALIVE_INTERVAL_MS = Number(process.env.WS_KEEPALIVE_INTERVAL_MS || 25000);

server.on('upgrade', (request, socket, head) => {
  let pathname = '';
  let authSessionId = '';
  try {
    const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
    pathname = parsedUrl.pathname;
    authSessionId = parsedUrl.searchParams.get('auth_session') || '';
  } catch (error) {
    log('warn', `无效的升级请求 URL: ${request.url}`);
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  
  // 只代理 /ws/chat 路径
  if (pathname === '/ws/chat') {
    cleanupExpiredSessions();
    if (!isSessionValid(authSessionId)) {
      log('warn', '拒绝未授权的 WebSocket 升级请求');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    log('info', `🔌 [WebSocket 代理] 收到 WebSocket 升级请求`);
    log('info', `   - 客户端: ${request.socket.remoteAddress}`);
    log('info', `   - URL: ${request.url}`);
    
    // 接受客户端 WebSocket 连接
    wss.handleUpgrade(request, socket, head, (clientWs) => {
      log('info', `✅ [WebSocket 代理] 客户端 WebSocket 连接已建立`);
      
      // 连接到 Gateway
      const targetUrl = `${gatewayWsUrl}/ws/chat${request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : ''}`;
      log('info', `   - 连接到 Gateway: ${targetUrl}`);
      
      const gatewayWs = new WebSocket(targetUrl);
      let clientAlive = true;
      let gatewayAlive = true;

      const cleanupKeepalive = () => {
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer);
        }
      };

      const keepaliveTimer = setInterval(() => {
        if (clientWs.readyState === WebSocket.OPEN) {
          if (!clientAlive) {
            log('warn', '⚠️ [WebSocket 代理] 客户端连接心跳超时，主动断开');
            clientWs.terminate();
          } else {
            clientAlive = false;
            clientWs.ping();
          }
        }

        if (gatewayWs.readyState === WebSocket.OPEN) {
          if (!gatewayAlive) {
            log('warn', '⚠️ [WebSocket 代理] Gateway 连接心跳超时，主动断开');
            gatewayWs.terminate();
          } else {
            gatewayAlive = false;
            gatewayWs.ping();
          }
        }
      }, WS_KEEPALIVE_INTERVAL_MS);
      keepaliveTimer.unref();
      
      // 客户端 -> Gateway
      clientWs.on('message', (data) => {
        clientAlive = true;
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.send(data.toString());
        }
      });
      
      // Gateway -> 客户端
      gatewayWs.on('message', (data) => {
        gatewayAlive = true;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data.toString());
        }
      });

      clientWs.on('pong', () => {
        clientAlive = true;
      });

      gatewayWs.on('pong', () => {
        gatewayAlive = true;
      });
      
      gatewayWs.on('open', () => {
        log('info', `✅ [WebSocket 代理] 已连接到 Gateway`);
      });
      
      gatewayWs.on('close', (code, reason) => {
        log('info', `🔌 [WebSocket 代理] Gateway 连接已关闭 (code: ${code})`);
        cleanupKeepalive();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(code, reason);
        }
      });
      
      gatewayWs.on('error', (error) => {
        log('error', `❌ [WebSocket 代理] Gateway 连接错误: ${error.message}`);
        cleanupKeepalive();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'Gateway connection error');
        }
      });
      
      clientWs.on('close', (code, reason) => {
        log('info', `🔌 [WebSocket 代理] 客户端连接已关闭 (code: ${code})`);
        cleanupKeepalive();
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.close(code, reason);
        }
      });
      
      clientWs.on('error', (error) => {
        log('error', `❌ [WebSocket 代理] 客户端连接错误: ${error.message}`);
        cleanupKeepalive();
        if (gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.close();
        }
      });
    });
    return;
  }
  socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
  socket.destroy();
});

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
