import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { log } from '../lib/logger.js';
import { cleanupExpiredSessions, isSessionValid, sessions, generateSessionId } from '../lib/sessions.js';
import {
  getVerifyState,
  registerVerifyFailure,
  clearVerifyAttempts,
  verifyKeyMatch,
  validateAccessKeyStrength
} from '../lib/rateLimiter.js';
import {
  getHeaderValue,
  getClientIp,
  normalizeIp,
  sanitizeSessionId,
  buildSessionMarkdown
} from '../lib/utils.js';
import {
  initDatabase,
  getDb,
  addChatMessage,
  getChatMessages,
  deleteChatMessage,
  toggleChatMessageFavorite,
  getChatSessions,
  addGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
  updateGroupMessageContent,
  toggleGroupMessageFavorite,
  clearGroupMessages,
  getGroupSessions,
  deleteGroupSession,
  getAssistants,
  getAssistant,
  getDefaultAssistant,
  addAssistant,
  updateAssistant,
  deleteAssistant,
  getSetting,
  setSetting,
  getAllSettings,
  getMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  toggleMemoryPin,
  getDocuments,
  addDocument,
  getDocument,
  deleteDocument
} from '../lib/database.js';

const router = express.Router();

// 初始化数据库（异步）
let dbReady = false;
initDatabase().then(() => {
  dbReady = true;
  log('info', '数据库初始化完成');
}).catch(err => {
  log('error', `数据库初始化失败: ${err.message}`);
});

// 配置（延迟读取，确保 dotenv 已加载）
function getConfig() {
  return {
    GATEWAY_URL: process.env.ZEROCLOW_GATEWAY_URL || 'http://localhost:8190',
    TOKEN: process.env.ZEROCLOW_TOKEN,
    ACCESS_KEY: process.env.ACCESS_KEY || 'zeroclaw2026',
    AI_BACKEND: (process.env.AI_BACKEND || 'zeroclaw').toLowerCase(),
    USE_PICOCLAW: (process.env.AI_BACKEND || 'zeroclaw').toLowerCase() === 'picoclaw',
    PICOCLAW_URL: process.env.PICOCLAW_GATEWAY_URL || 'http://localhost:18790',
    PICOCLAW_TOKEN: process.env.PICOCLAW_TOKEN || '',
    IMAGE_UPLOAD_ENABLED: process.env.IMAGE_UPLOAD_ENABLED !== 'false',
    MEMORY_ENABLED: process.env.MEMORY_ENABLED === 'true',
    SESSION_TTL_MS: Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000)
  };
}

// 前端会先用本地 id 渲染消息，之后靠同一个 id 去删除/收藏/更新。
// 若后端另生成 id，前端持有的 id 在库中不存在，那些操作会静默失效。
// 所以采用前端传来的 id，仅做格式校验；缺失或非法时才回退到自生成。
function adoptClientId(rawId, prefix) {
  if (typeof rawId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(rawId)) {
    return rawId;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 中间件：验证会话
function requireVerifiedSession(req, res, next) {
  cleanupExpiredSessions();
  const sessionId = getHeaderValue(req.headers['x-session-id']) || req.query.session_id;
  if (!isSessionValid(sessionId)) {
    return res.status(401).json({ success: false, error: '未授权或会话已过期' });
  }
  req.sessionId = sessionId;
  next();
}

// 验证 ACCESS_KEY 强度（在服务器启动时调用）
export function validateAccessKey() {
  const { ACCESS_KEY } = getConfig();
  if (process.env.NODE_ENV === 'production' && !validateAccessKeyStrength(ACCESS_KEY)) {
    throw new Error('生产环境 ACCESS_KEY 强度不足：至少 12 位且包含字母与数字');
  }
  if (ACCESS_KEY === 'zeroclaw2026') {
    log('warn', '检测到默认 ACCESS_KEY，建议尽快在 .env 中替换');
  }
}

// API 路由 - 获取配置
router.get('/api/config', (req, res) => {
  log('info', '返回 Gateway 配置信息');
  const { GATEWAY_URL, TOKEN, USE_PICOCLAW, PICOCLAW_URL, PICOCLAW_TOKEN, IMAGE_UPLOAD_ENABLED, MEMORY_ENABLED } = getConfig();
  const activeUrl = USE_PICOCLAW ? PICOCLAW_URL : GATEWAY_URL;
  const activeToken = USE_PICOCLAW ? PICOCLAW_TOKEN : TOKEN;
  res.json({
    gatewayUrl: activeUrl,
    token: activeToken || null,
    hasServerToken: Boolean(activeToken),
    backend: USE_PICOCLAW ? 'picoclaw' : 'zeroclaw',
    imageUploadEnabled: IMAGE_UPLOAD_ENABLED,
    memoryEnabled: MEMORY_ENABLED
  });
});

// API 路由 - 验证访问密钥
router.post('/api/verify', (req, res) => {
  const { key } = req.body;
  const clientIp = normalizeIp(getClientIp(req));
  const verifyState = getVerifyState(clientIp);
  const { ACCESS_KEY, SESSION_TTL_MS } = getConfig();

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

  log('warn', `验证失败: ${clientIp}, remaining=${updatedState.remainingAttempts}`);
  return res.status(401).json({
    success: false,
    message: '密钥错误',
    remainingAttempts: updatedState.remainingAttempts
  });
});

// API 路由 - 执行命令（受限）
router.post('/api/execute', requireVerifiedSession, (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: '缺少命令参数' });
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return res.status(400).json({ success: false, error: '命令不能为空' });
  }

  if (/[;&|`$(){}!<>]/.test(trimmed)) {
    log('warn', `拒绝危险字符命令: ${trimmed}`);
    return res.status(403).json({ success: false, error: '命令包含不允许的字符' });
  }

  const parts = trimmed.split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);

  const allowedCommandArgs = new Map([
    ['uname', [[]]],
    ['ls', [[], ['/tmp'], ['-la', '/tmp'], ['-la']]],
    ['cat', [['/proc/version'], ['/proc/cpuinfo'], ['/proc/meminfo']]],
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

// API 路由 - 获取设置
router.get('/api/settings', requireVerifiedSession, (req, res) => {
  const settings = {
    userName: getSetting('userName') || 'Wenyin',
    assistantName: getSetting('assistantName') || 'Claw Agent',
    theme: getSetting('theme') || 'light',
    notifications: getSetting('notifications') === 'true'
  };
  return res.json({ success: true, settings });
});

// API 路由 - 更新设置
router.put('/api/settings', requireVerifiedSession, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, error: '无效的设置数据' });
  }

  for (const [key, value] of Object.entries(updates)) {
    setSetting(key, String(value));
  }

  log('info', '设置已更新');
  const settings = {
    userName: getSetting('userName') || 'Wenyin',
    assistantName: getSetting('assistantName') || 'Claw Agent',
    theme: getSetting('theme') || 'light',
    notifications: getSetting('notifications') === 'true'
  };
  // 推给其他标签页，前端 SSE 已监听 settings 事件
  broadcastSettings(settings);
  return res.json({ success: true, settings });
});

// API 路由 - 获取私聊消息
router.get('/api/chat/messages', requireVerifiedSession, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 500);
  const sessionId = req.query.session_id || req.sessionId;
  const messages = getChatMessages(sessionId, limit);
  return res.json({ success: true, messages });
});

// API 路由 - 发送私聊消息
router.post('/api/chat/send', requireVerifiedSession, (req, res) => {
  const { sessionId, content, role, thinking, images, parentMsgId, id } = req.body;
  if (!content && (!images || images.length === 0)) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }

  const message = {
    id: adoptClientId(id, 'msg'),
    role: role || 'user',
    content: content || '',
    thinking: thinking || '',
    images: Array.isArray(images) ? images : [],
    favorite: false,
    parentMsgId: parentMsgId || null
  };

  // 使用前端传来的 sessionId，如果没有则使用验证后的 sessionId
  const chatSessionId = sessionId || req.sessionId;
  addChatMessage(chatSessionId, message);

  log('info', `私聊消息已发送: ${message.id}, session: ${chatSessionId}`);
  return res.json({ success: true, message: { ...message, timestamp: new Date().toISOString() } });
});

// API 路由 - 删除私聊消息
router.delete('/api/chat/messages/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  if (!deleteChatMessage(id)) {
    log('warn', `待删除的私聊消息不存在: ${id}`);
    return res.status(404).json({ success: false, error: '消息不存在' });
  }
  log('info', `私聊消息已删除: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 私聊消息收藏
router.post('/api/chat/messages/:id/favorite', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  toggleChatMessageFavorite(id);
  log('info', `私聊消息收藏状态已切换: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 获取群聊消息
router.get('/api/group/messages', requireVerifiedSession, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 500);
  const assistantId = req.query.assistant_id || null;
  const groupSessionId = req.query.session_id || null;
  const messages = getGroupMessages(assistantId, limit, groupSessionId);
  return res.json({ success: true, messages });
});

// API 路由 - 发送群聊消息
router.post('/api/group/send', requireVerifiedSession, (req, res) => {
  const { content, sender, assistantId, parentMsgId, images, id, sessionId } = req.body;
  if (!content && (!images || images.length === 0)) {
    return res.status(400).json({ success: false, error: '消息内容不能为空' });
  }

  const message = {
    id: adoptClientId(id, 'grp'),
    sessionId: sessionId || 'group-legacy',
    assistantId: assistantId || 'default',
    sender: sender || '用户',
    role: 'user',
    content: content || '',
    images: Array.isArray(images) ? images : [],
    avatar: '👤',
    color: 'var(--text)',
    favorite: false,
    parentMsgId: parentMsgId || null
  };

  addGroupMessage(message);

  log('info', `群聊消息已发送: ${message.id}`);
  // 带上 timestamp：前端直接渲染这个对象，缺字段会显示 Invalid Date
  return res.json({ success: true, message: { ...message, timestamp: new Date().toISOString() } });
});

// API 路由 - 助手回复群聊消息
router.post('/api/group/reply', requireVerifiedSession, (req, res) => {
  const { content, assistantId, parentMsgId, thinking, id, sessionId } = req.body;
  if (!content) {
    return res.status(400).json({ success: false, error: '回复内容不能为空' });
  }

  const assistant = getAssistant(assistantId) || getDefaultAssistant();

  const message = {
    id: adoptClientId(id, 'grp'),
    sessionId: sessionId || 'group-legacy',
    assistantId: assistant.id,
    sender: assistant.name,
    role: 'assistant',
    content,
    thinking: thinking || '',
    images: [],
    avatar: assistant.avatar,
    color: assistant.color,
    favorite: false,
    parentMsgId: parentMsgId || null
  };

  addGroupMessage(message);

  log('info', `助手回复已发送: ${message.id}, 助手: ${assistant.name}`);
  return res.json({ success: true, message: { ...message, timestamp: new Date().toISOString() } });
});

// API 路由 - 删除群聊消息
router.delete('/api/group/messages/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  if (!deleteGroupMessage(id)) {
    log('warn', `待删除的群聊消息不存在: ${id}`);
    return res.status(404).json({ success: false, error: '消息不存在' });
  }
  log('info', `群聊消息已删除: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 群聊消息收藏
router.post('/api/group/messages/:id/favorite', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  toggleGroupMessageFavorite(id);
  log('info', `群聊消息收藏状态已切换: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 更新群聊消息
router.put('/api/group/messages/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  const { content, thinking } = req.body;

  // 走 database.js：直接 db.run 会漏掉 saveDatabase()，改动只留在内存里
  if (!updateGroupMessageContent(id, content, thinking)) {
    log('warn', `待更新的群聊消息不存在: ${id}`);
    return res.status(404).json({ success: false, error: '消息不存在' });
  }

  log('info', `群聊消息已更新: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 清空群聊消息
router.delete('/api/group/messages', requireVerifiedSession, (req, res) => {
  const { assistant_id } = req.query;
  clearGroupMessages(assistant_id || null);
  log('info', `群聊消息已清空: ${assistant_id || 'all'}`);
  return res.json({ success: true });
});

// API 路由 - 群聊会话列表
router.get('/api/group/sessions', requireVerifiedSession, (req, res) => {
  const sessions = getGroupSessions();
  return res.json({
    success: true,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      fileName: `${s.sessionId}.md`,
      updatedAt: s.updatedAt,
      messageCount: s.messageCount
    }))
  });
});

// API 路由 - 群聊会话详情（含可下载的 Markdown）
router.get('/api/group/sessions/:sessionId', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.params;
  const messages = getGroupMessages(null, 500, sessionId);

  return res.json({
    success: true,
    sessionId,
    fileName: `${sessionId}.md`,
    updatedAt: messages.length > 0 ? messages[messages.length - 1].timestamp : new Date().toISOString(),
    content: buildSessionMarkdown(sessionId, messages),
    messages
  });
});

// API 路由 - 删除群聊会话
router.delete('/api/group/sessions/:sessionId', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.params;
  const removed = deleteGroupSession(sessionId);
  if (removed === 0) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }
  log('info', `群聊会话已删除: ${sessionId}, 消息数: ${removed}`);
  return res.json({ success: true, sessionId, removed });
});

// API 路由 - 获取助手列表
router.get('/api/assistants', requireVerifiedSession, (req, res) => {
  const assistants = getAssistants();
  return res.json({ success: true, assistants });
});

// API 路由 - 创建助手
router.post('/api/assistants', requireVerifiedSession, (req, res) => {
  const { name, avatar, systemPrompt, color, triggers } = req.body;
  if (!name || !systemPrompt) {
    return res.status(400).json({ success: false, error: '名称和提示词不能为空' });
  }

  const assistant = {
    id: `ast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    avatar: avatar || '🤖',
    systemPrompt,
    color: color || '#6fb1ff',
    triggers: Array.isArray(triggers) ? triggers : [],
    isDefault: false
  };

  addAssistant(assistant);

  log('info', `助手已创建: ${assistant.id}`);
  return res.json({ success: true, assistant });
});

// API 路由 - 更新助手
router.put('/api/assistants/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const existing = getAssistant(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: '助手不存在' });
  }

  delete updates.isDefault;
  delete updates.id;

  updateAssistant(id, updates);

  const updated = getAssistant(id);
  log('info', `助手已更新: ${id}`);
  return res.json({ success: true, assistant: updated });
});

// API 路由 - 删除助手
router.delete('/api/assistants/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;

  const assistant = getAssistant(id);
  if (!assistant) {
    return res.status(404).json({ success: false, error: '助手不存在' });
  }

  if (assistant.isDefault) {
    return res.status(400).json({ success: false, error: '不能删除默认助手' });
  }

  deleteAssistant(id);

  log('info', `助手已删除: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 获取默认助手
router.get('/api/assistants/default', requireVerifiedSession, (req, res) => {
  const assistant = getDefaultAssistant();
  return res.json({ success: true, assistant });
});

// 贴纸以文件形式存放，由 server.js 的 /stickers 静态服务提供访问。
// 不存数据库：base64 图片会让 sql.js 每次写入全量重写整个 db 文件。
// 必须与 server.js 的 /stickers 静态服务指向同一目录，
// 用 __dirname 而非 cwd：从其他目录启动服务时 cwd 并非项目根
const STICKERS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'stickers');
const STICKER_FILE_RE = /^[a-zA-Z0-9._-]+\.(png|jpg|gif|webp)$/;

function ensureStickersDir() {
  if (!fs.existsSync(STICKERS_DIR)) {
    fs.mkdirSync(STICKERS_DIR, { recursive: true });
  }
}

// 解析出磁盘路径，任何越界或非法文件名都返回 null
function resolveStickerPath(id) {
  if (typeof id !== 'string' || !STICKER_FILE_RE.test(id)) return null;
  const filePath = path.join(STICKERS_DIR, id);
  // 双重保险：确认解析结果仍在贴纸目录内
  if (path.dirname(path.resolve(filePath)) !== path.resolve(STICKERS_DIR)) return null;
  return filePath;
}

// API 路由 - 获取贴纸列表
router.get('/api/stickers', requireVerifiedSession, (req, res) => {
  ensureStickersDir();

  const stickers = fs.readdirSync(STICKERS_DIR)
    .filter(name => STICKER_FILE_RE.test(name))
    .map(name => {
      const stat = fs.statSync(path.join(STICKERS_DIR, name));
      return {
        id: name,
        name: name.replace(/\.[^.]+$/, ''),
        url: `/stickers/${name}`,
        createdAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ success: true, stickers });
});

// API 路由 - 上传贴纸
router.post('/api/stickers', requireVerifiedSession, (req, res) => {
  const { dataUrl, name } = req.body;
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ success: false, error: '缺少贴纸数据' });
  }

  const matched = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!matched) {
    return res.status(400).json({ success: false, error: '仅支持 png/jpg/gif/webp 图片' });
  }

  const buffer = Buffer.from(matched[2], 'base64');
  if (buffer.length === 0) {
    return res.status(400).json({ success: false, error: '图片内容为空' });
  }
  if (buffer.length > 2 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: '贴纸大小不能超过 2MB' });
  }

  ensureStickersDir();

  const ext = matched[1] === 'jpeg' ? 'jpg' : matched[1];
  const id = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`;
  const filePath = resolveStickerPath(id);
  if (!filePath) {
    return res.status(500).json({ success: false, error: '生成贴纸文件名失败' });
  }

  fs.writeFileSync(filePath, buffer);
  log('info', `贴纸已上传: ${id} (${buffer.length} 字节)`);

  return res.json({
    success: true,
    sticker: {
      id,
      name: name ? String(name).replace(/\.[^.]+$/, '') : '贴纸',
      url: `/stickers/${id}`,
      createdAt: new Date().toISOString()
    }
  });
});

// API 路由 - 删除贴纸
router.delete('/api/stickers/:id', requireVerifiedSession, (req, res) => {
  const filePath = resolveStickerPath(req.params.id);
  if (!filePath) {
    log('warn', `拒绝非法贴纸路径: ${req.params.id}`);
    return res.status(400).json({ success: false, error: '非法的贴纸标识' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '贴纸不存在' });
  }

  fs.unlinkSync(filePath);
  log('info', `贴纸已删除: ${req.params.id}`);
  return res.json({ success: true, id: req.params.id });
});

// 控制台事件存储（内存中）
const consoleEvents = [];
const MAX_CONSOLE_EVENTS = 1000;

function addConsoleEvent(type, title, body) {
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    body,
    timestamp: new Date().toISOString()
  };

  consoleEvents.push(event);

  if (consoleEvents.length > MAX_CONSOLE_EVENTS) {
    consoleEvents.splice(0, consoleEvents.length - MAX_CONSOLE_EVENTS);
  }

  return event;
}

// API 路由 - 获取控制台事件
router.get('/api/console/events', requireVerifiedSession, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, MAX_CONSOLE_EVENTS);
  const events = consoleEvents.slice(-limit);
  return res.json({ success: true, events });
});

// API 路由 - 添加控制台事件
router.post('/api/console/events', requireVerifiedSession, (req, res) => {
  const { type, title, body } = req.body;
  if (!type || !title) {
    return res.status(400).json({ success: false, error: '缺少必要参数' });
  }

  const event = addConsoleEvent(type, title, body || '');
  return res.json({ success: true, event });
});

// 会话记录存储（兼容旧接口）
const sessionRecords = new Map();

// API 路由 - 获取会话列表
router.get('/api/sessions', requireVerifiedSession, (req, res) => {
  const sessions = getChatSessions();
  return res.json({
    success: true,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      fileName: `${s.sessionId}.json`,
      updatedAt: s.updatedAt,
      messageCount: s.messageCount
    }))
  });
});

// API 路由 - 获取会话详情
router.get('/api/sessions/:sessionId', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.params;
  const messages = getChatMessages(sessionId, 500);

  return res.json({
    success: true,
    sessionId,
    fileName: `${sessionId}.json`,
    updatedAt: messages.length > 0 ? messages[messages.length - 1].timestamp : new Date().toISOString(),
    content: buildSessionMarkdown(sessionId, messages),
    messages
  });
});

// API 路由 - 删除会话
router.delete('/api/sessions/:sessionId', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.params;

  // 删除该会话的所有消息
  const messages = getChatMessages(sessionId, 10000);
  for (const msg of messages) {
    deleteChatMessage(msg.id);
  }

  log('info', `会话已删除: ${sessionId}, 消息数: ${messages.length}`);
  return res.json({ success: true, sessionId });
});

// API 路由 - 会话清理 (forge)
router.post('/api/sessions/forge', requireVerifiedSession, (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: '缺少 sessionId' });
  }

  // 获取当前会话的所有消息
  const messages = getChatMessages(sessionId, 10000);
  const originalCount = messages.length;

  // 过滤：保留 user/assistant 文本消息，移除系统消息
  const cleanedMessages = messages.filter(msg => {
    if (msg.role === 'system') return false;
    if (!msg.content || msg.content.trim() === '') return false;
    return true;
  });

  // 删除原消息
  for (const msg of messages) {
    deleteChatMessage(msg.id);
  }

  // 重新插入清理后的消息
  for (const msg of cleanedMessages) {
    addChatMessage(sessionId, msg);
  }

  // 添加系统消息标记
  addChatMessage(sessionId, {
    id: `sys-forge-${Date.now()}`,
    role: 'system',
    content: `--- 会话已清理 (原 ${originalCount} 条，保留 ${cleanedMessages.length} 条) ---`,
    thinking: '',
    images: [],
    favorite: false,
    parentMsgId: null
  });

  log('info', `会话已清理: ${sessionId}, 原消息数: ${originalCount}, 保留: ${cleanedMessages.length}`);

  return res.json({
    success: true,
    sessionId,
    originalCount,
    cleanedCount: cleanedMessages.length
  });
});

// 初始化控制台事件
addConsoleEvent('system', '系统启动', '服务器已启动');
const initConfig = getConfig();
addConsoleEvent('system', '后端配置', `当前后端: ${initConfig.USE_PICOCLAW ? 'PicoClaw' : 'ZeroClaw'}`);

// API 路由 - 获取记忆列表
router.get('/api/memories', requireVerifiedSession, (req, res) => {
  const memories = getMemories();
  return res.json({ success: true, memories });
});

// API 路由 - 创建记忆
router.post('/api/memories', requireVerifiedSession, (req, res) => {
  const { title, content, tags, mood } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, error: '标题和内容不能为空' });
  }

  // 置顶记忆会随每条消息发给 Gateway，且每次写入都会全量重写数据库
  if (content.length > 100 * 1024) {
    return res.status(400).json({ success: false, error: '记忆内容不能超过 100KB' });
  }

  const memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    content,
    tags: Array.isArray(tags) ? tags : [],
    mood: mood || 'neutral',
    pinned: false
  };

  addMemory(memory);

  log('info', `记忆已创建: ${memory.id}`);
  return res.json({ success: true, memory });
});

// API 路由 - 更新记忆
router.put('/api/memories/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  updateMemory(id, updates);

  log('info', `记忆已更新: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 删除记忆
router.delete('/api/memories/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;

  deleteMemory(id);

  log('info', `记忆已删除: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 切换置顶
router.post('/api/memories/:id/pin', requireVerifiedSession, (req, res) => {
  const { id } = req.params;

  toggleMemoryPin(id);

  log('info', `记忆置顶状态已切换: ${id}`);
  return res.json({ success: true, id });
});

// API 路由 - 获取文档列表
router.get('/api/documents', requireVerifiedSession, (req, res) => {
  const documents = getDocuments();
  return res.json({ success: true, documents });
});

// API 路由 - 上传文档
router.post('/api/documents', requireVerifiedSession, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, error: '标题和内容不能为空' });
  }

  if (content.length > 500 * 1024) {
    return res.status(400).json({ success: false, error: '文档内容不能超过 500KB' });
  }

  const document = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    filename: `${title}.txt`,
    content,
    size: content.length
  };

  addDocument(document);

  log('info', `文档已上传: ${document.id}`);
  return res.json({ success: true, document });
});

// API 路由 - 获取文档内容
router.get('/api/documents/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;
  const document = getDocument(id);

  if (!document) {
    return res.status(404).json({ success: false, error: '文档不存在' });
  }

  return res.json({ success: true, document });
});

// API 路由 - 删除文档
router.delete('/api/documents/:id', requireVerifiedSession, (req, res) => {
  const { id } = req.params;

  deleteDocument(id);

  log('info', `文档已删除: ${id}`);
  return res.json({ success: true, id });
});

// SSE 客户端管理
const sseClients = new Set();

function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// API 路由 - SSE 实时更新
router.get('/api/stream', requireVerifiedSession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const settings = {
    userName: getSetting('userName') || 'Wenyin',
    assistantName: getSetting('assistantName') || 'Claw Agent',
    theme: getSetting('theme') || 'light',
    notifications: getSetting('notifications') === 'true'
  };

  const snapshot = {
    settings,
    assistants: getAssistants(),
    stickers: []
  };
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

  // 必须存 res：broadcastSSE 调用 client.write()，req 是可读流没有该方法
  sseClients.add(res);
  log('info', `SSE 客户端已连接, 当前: ${sseClients.size}`);

  const heartbeat = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    log('info', `SSE 客户端已断开, 当前: ${sseClients.size}`);
  });
});

export function broadcastMessage(message) {
  broadcastSSE('message', message);
}

export function broadcastSettings(settings) {
  broadcastSSE('settings', settings);
}

export function broadcastConsoleEvent(event) {
  broadcastSSE('console', event);
}

export function broadcastStickers(stickers) {
  broadcastSSE('stickers', stickers);
}

export { router };
