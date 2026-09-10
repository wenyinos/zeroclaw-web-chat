import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'chat.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;

// 聊天记录一律不存图片本体：base64 data URL 动辄几百 KB，而 sql.js 每次写入都要
// 全量重写整库，图多了数据库会瞬间膨胀。落库时只留这个占位符，前端据此渲染提示。
// 前端 public/js/chat.js 的 IMAGE_PLACEHOLDER 必须与此保持一致。
export const IMAGE_PLACEHOLDER = '__image_omitted__';

// 允许落库的只有「短引用」——贴纸等静态资源的 URL，几十字节，不构成膨胀。
// 内联 data URL 或超长字符串（base64）统一换成占位符，数组长度保留，图片张数信息不丢。
const MAX_IMAGE_REF_LENGTH = 512;

export function sanitizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map(img => {
    if (typeof img !== 'string') return IMAGE_PLACEHOLDER;
    if (img.startsWith('data:')) return IMAGE_PLACEHOLDER;
    if (img.length > MAX_IMAGE_REF_LENGTH) return IMAGE_PLACEHOLDER;
    return img;
  });
}

// 初始化数据库
export async function initDatabase() {
  const SQL = await initSqlJs();

  // 如果数据库文件存在，加载它；否则创建新数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      thinking TEXT,
      images TEXT,
      favorite INTEGER DEFAULT 0,
      parent_msg_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      assistant_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      thinking TEXT,
      images TEXT,
      avatar TEXT,
      color TEXT,
      favorite INTEGER DEFAULT 0,
      parent_msg_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '🤖',
      system_prompt TEXT,
      color TEXT DEFAULT '#6fb1ff',
      triggers TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      tags TEXT,
      mood TEXT DEFAULT 'neutral',
      pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filename TEXT,
      content TEXT,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 迁移：老库的 group_messages 没有 session_id 列，补上并把存量消息归入一个历史会话
  const groupCols = db.exec('PRAGMA table_info(group_messages)');
  const hasSessionId = groupCols[0]?.values?.some(row => row[1] === 'session_id');
  if (!hasSessionId) {
    db.run('ALTER TABLE group_messages ADD COLUMN session_id TEXT');
    console.log('🔧 group_messages 已补充 session_id 列');
  }
  // 无论新旧库，都保证不存在游离消息（否则它们不属于任何会话，界面上会消失）
  db.run("UPDATE group_messages SET session_id = 'group-legacy' WHERE session_id IS NULL OR session_id = ''");

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_group_messages_session ON group_messages(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_group_messages_assistant ON group_messages(assistant_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created_at)');

  // 插入默认助手
  const defaultAssistants = [
    { id: 'default', name: 'Claw Agent', avatar: '🐾', system_prompt: '你是一个友好的AI助手，名叫Claw Agent。你乐于助人，善于沟通。', color: '#c97b5a', triggers: '["@claw","@agent"]', is_default: 1 },
    { id: 'coder', name: 'Code Bot', avatar: '💻', system_prompt: '你是一个专业的程序员助手。你擅长写代码、调试、解释技术概念。回复时优先提供代码示例。', color: '#6fb1ff', triggers: '["@coder","@代码"]', is_default: 0 },
    { id: 'writer', name: 'Writer', avatar: '✍️', system_prompt: '你是一个创意写作助手。你擅长写文章、故事、文案。回复时注重文采和创意。', color: '#8aa97f', triggers: '["@writer","@写作"]', is_default: 0 }
  ];

  for (const a of defaultAssistants) {
    db.run(
      'INSERT OR IGNORE INTO assistants (id, name, avatar, system_prompt, color, triggers, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.id, a.name, a.avatar, a.system_prompt, a.color, a.triggers, a.is_default]
    );
  }

  // 迁移：老库把图片本体写进了 images 列，这里一次性换成占位符，把膨胀的那部分还回来。
  // 整体兜底：清理只是优化，任何失败（磁盘不足导致 VACUUM 失败、老库异常大等）都绝不能拦住服务启动。
  let purged = 0;
  let sizeBefore = 0;
  let compacted = false;
  try {
    sizeBefore = fs.statSync(DB_PATH).size;
    purged = purgeStoredImages();
    compacted = compactIfWasteful(sizeBefore);
  } catch (err) {
    console.error(`⚠️ 历史图片清理失败（不影响启动，数据已按新规则写入）: ${err.message}`);
  }

  // 保存数据库
  saveDatabase();

  // 体积变化在落盘后才准，所以放到 saveDatabase 之后打印，便于线上确认清理是否真的生效
  if (purged > 0 || compacted) {
    const sizeAfter = fs.statSync(DB_PATH).size;
    const what = purged > 0 ? `已清理 ${purged} 条历史记录中的图片数据（改为占位符）` : '已回收数据库空闲页';
    console.log(`🧹 ${what}，库体积 ${toReadableSize(sizeBefore)} → ${toReadableSize(sizeAfter)}`);
  }

  console.log('✅ 数据库初始化完成');
}

function toReadableSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// 回收空洞：SQLite 删除或覆盖数据只把页挂进 freelist，文件不会自己变小。
// 判定依据是「空洞是否值得重建」而不是「这次有没有清理动作」——这样上次 VACUUM 失败留下的空洞，
// 下次启动会自动重试。阈值取 1MB 且占库 10%：VACUUM 是整库重建，小空洞不值得折腾。
function compactIfWasteful(fileSize) {
  const readPragma = (name) => {
    const res = db.exec(`PRAGMA ${name}`);
    return Number(res[0]?.values?.[0]?.[0] || 0);
  };
  const wasted = readPragma('freelist_count') * readPragma('page_size');
  if (wasted < 1024 * 1024 || wasted < fileSize * 0.1) return false;
  db.run('VACUUM');
  return true;
}

// 把历史记录里的图片本体替换成占位符。只扫真正带了图片的行，且结果与原值相同时不写，
// 所以重复启动是幂等的空操作。分两步走是刻意的：先只取 rowid，再逐行读取、逐行更新——
// 老库的 images 列可能装着几百 MB base64，一次性全读进内存会把启动内存顶爆。
// 循环内不调 saveDatabase——统一交给 initDatabase 结尾那一次落盘。
function purgeStoredImages() {
  let purged = 0;
  for (const table of ['chat_messages', 'group_messages']) {
    const idStmt = db.prepare(`SELECT rowid FROM ${table} WHERE images IS NOT NULL AND images NOT IN ('', '[]')`);
    const rowids = [];
    while (idStmt.step()) {
      rowids.push(idStmt.getAsObject().rowid);
    }
    idStmt.free();
    if (rowids.length === 0) continue;

    const readStmt = db.prepare(`SELECT images FROM ${table} WHERE rowid = ?`);
    for (const rowid of rowids) {
      readStmt.bind([rowid]);
      const raw = readStmt.step() ? readStmt.getAsObject().images : null;
      readStmt.reset();
      if (typeof raw !== 'string') continue;

      let images;
      try {
        images = JSON.parse(raw);
      } catch {
        images = [];
      }
      const sanitized = JSON.stringify(sanitizeImages(images));
      if (sanitized === raw) continue;
      db.run(`UPDATE ${table} SET images = ? WHERE rowid = ?`, [sanitized, rowid]);
      purged += 1;
    }
    readStmt.free();
  }
  return purged;
}

// SQLite 的 CURRENT_TIMESTAMP 产出 UTC 的 "YYYY-MM-DD HH:MM:SS"，
// 这个格式不带时区标记，前端 new Date() 会当成本地时间解析（差一个时区）。
// 统一在映射层补上 Z 转成 ISO，保证前端拿到的时间没有歧义。
function toIsoTime(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
  }
  return value;
}

// 保存数据库到文件（先写临时文件再原子替换，避免写盘中途崩溃损坏整库）
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, DB_PATH);
}

// ===== 私聊消息 =====

export function addChatMessage(sessionId, message) {
  db.run(
    'INSERT INTO chat_messages (id, session_id, role, content, thinking, images, favorite, parent_msg_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, sessionId, message.role, message.content || '', message.thinking || '', JSON.stringify(sanitizeImages(message.images)), message.favorite ? 1 : 0, message.parentMsgId || null]
  );
  saveDatabase();
}

export function getChatMessages(sessionId, limit = 80) {
  // 次级排序用 rowid：created_at 只精确到秒，同秒内的消息顺序否则不稳定
  const stmt = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?');
  stmt.bind([sessionId, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.reverse().map(row => ({
    id: row.id,
    role: row.role,
    content: row.content,
    thinking: row.thinking,
    images: JSON.parse(row.images || '[]'),
    favorite: row.favorite === 1,
    parentMsgId: row.parent_msg_id,
    timestamp: toIsoTime(row.created_at)
  }));
}

// 返回是否真的删到了记录：接口据此回 404，避免 id 不匹配时假装成功
export function deleteChatMessage(id) {
  db.run('DELETE FROM chat_messages WHERE id = ?', [id]);
  const removed = db.getRowsModified() > 0;
  saveDatabase();
  return removed;
}

export function toggleChatMessageFavorite(id) {
  db.run('UPDATE chat_messages SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [id]);
  const updated = db.getRowsModified() > 0;
  saveDatabase();
  return updated;
}

// 私聊消息内容更新：流式分段后用更完整的同源版本原地替换
export function updateChatMessageContent(id, content, thinking) {
  db.run('UPDATE chat_messages SET content = ?, thinking = ? WHERE id = ?', [content, thinking || '', id]);
  const updated = db.getRowsModified() > 0;
  saveDatabase();
  return updated;
}

// 整会话删除：一条 SQL，避免逐条删触发多次全库重写
export function deleteChatSession(sessionId) {
  db.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  const removed = db.getRowsModified();
  saveDatabase();
  return removed;
}

export function getChatSessions() {
  const stmt = db.prepare('SELECT session_id, MIN(created_at) as created_at, MAX(created_at) as updated_at, COUNT(*) as message_count FROM chat_messages GROUP BY session_id ORDER BY updated_at DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(row => ({
    sessionId: row.session_id,
    createdAt: toIsoTime(row.created_at),
    updatedAt: toIsoTime(row.updated_at),
    messageCount: row.message_count
  }));
}

// ===== 群聊消息 =====

export function addGroupMessage(message) {
  db.run(
    'INSERT INTO group_messages (id, session_id, assistant_id, sender, role, content, thinking, images, avatar, color, favorite, parent_msg_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, message.sessionId || 'group-legacy', message.assistantId || 'default', message.sender, message.role, message.content || '', message.thinking || '', JSON.stringify(sanitizeImages(message.images)), message.avatar || '🤖', message.color || '#c97b5a', message.favorite ? 1 : 0, message.parentMsgId || null]
  );
  saveDatabase();
}

export function getGroupMessages(assistantId = null, limit = 80, sessionId = null) {
  const where = [];
  const params = [];
  if (sessionId) {
    where.push('session_id = ?');
    params.push(sessionId);
  }
  if (assistantId) {
    where.push('assistant_id = ?');
    params.push(assistantId);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const stmt = db.prepare(`SELECT * FROM group_messages ${clause} ORDER BY created_at DESC, rowid DESC LIMIT ?`);
  stmt.bind([...params, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.reverse().map(row => ({
    id: row.id,
    sessionId: row.session_id,
    assistantId: row.assistant_id,
    sender: row.sender,
    role: row.role,
    content: row.content,
    thinking: row.thinking,
    images: JSON.parse(row.images || '[]'),
    avatar: row.avatar,
    color: row.color,
    favorite: row.favorite === 1,
    parentMsgId: row.parent_msg_id,
    timestamp: toIsoTime(row.created_at)
  }));
}

export function deleteGroupMessage(id) {
  db.run('DELETE FROM group_messages WHERE id = ?', [id]);
  const removed = db.getRowsModified() > 0;
  saveDatabase();
  return removed;
}

// 助手回复到达后，把「正在思考...」占位更新成真实内容
export function updateGroupMessageContent(id, content, thinking) {
  db.run('UPDATE group_messages SET content = ?, thinking = ? WHERE id = ?', [content, thinking || '', id]);
  const updated = db.getRowsModified() > 0;
  saveDatabase();
  return updated;
}

export function toggleGroupMessageFavorite(id) {
  db.run('UPDATE group_messages SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [id]);
  const updated = db.getRowsModified() > 0;
  saveDatabase();
  return updated;
}

// 群聊会话列表，与 getChatSessions 同构
export function getGroupSessions() {
  const stmt = db.prepare('SELECT session_id, MIN(created_at) as created_at, MAX(created_at) as updated_at, COUNT(*) as message_count FROM group_messages WHERE session_id IS NOT NULL GROUP BY session_id ORDER BY updated_at DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(row => ({
    sessionId: row.session_id,
    createdAt: toIsoTime(row.created_at),
    updatedAt: toIsoTime(row.updated_at),
    messageCount: row.message_count
  }));
}

// 整会话删除：一条 SQL 搞定，避免逐条删触发多次全库重写
export function deleteGroupSession(sessionId) {
  db.run('DELETE FROM group_messages WHERE session_id = ?', [sessionId]);
  const removed = db.getRowsModified();
  saveDatabase();
  return removed;
}

// ===== 助手 =====

export function getAssistants() {
  const stmt = db.prepare('SELECT * FROM assistants ORDER BY is_default DESC, created_at ASC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    systemPrompt: row.system_prompt,
    color: row.color,
    triggers: JSON.parse(row.triggers || '[]'),
    isDefault: row.is_default === 1
  }));
}

export function getAssistant(id) {
  const stmt = db.prepare('SELECT * FROM assistants WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    systemPrompt: row.system_prompt,
    color: row.color,
    triggers: JSON.parse(row.triggers || '[]'),
    isDefault: row.is_default === 1
  };
}

export function getDefaultAssistant() {
  const stmt = db.prepare('SELECT * FROM assistants WHERE is_default = 1 LIMIT 1');
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) return getAssistants()[0];
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    systemPrompt: row.system_prompt,
    color: row.color,
    triggers: JSON.parse(row.triggers || '[]'),
    isDefault: row.is_default === 1
  };
}

export function addAssistant(assistant) {
  db.run(
    'INSERT INTO assistants (id, name, avatar, system_prompt, color, triggers, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [assistant.id, assistant.name, assistant.avatar || '🤖', assistant.systemPrompt, assistant.color || '#6fb1ff', JSON.stringify(assistant.triggers || []), assistant.isDefault ? 1 : 0]
  );
  saveDatabase();
}

export function updateAssistant(id, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.avatar !== undefined) { fields.push('avatar = ?'); values.push(updates.avatar); }
  if (updates.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.systemPrompt); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.triggers !== undefined) { fields.push('triggers = ?'); values.push(JSON.stringify(updates.triggers)); }

  if (fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE assistants SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteAssistant(id) {
  db.run('DELETE FROM assistants WHERE id = ? AND is_default = 0', [id]);
  saveDatabase();
}

// ===== 设置 =====

export function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  saveDatabase();
}

export function getAllSettings() {
  const stmt = db.prepare('SELECT * FROM settings');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ===== 记忆 =====

export function getMemories() {
  const stmt = db.prepare('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    mood: row.mood,
    pinned: row.pinned === 1,
    createdAt: toIsoTime(row.created_at),
    updatedAt: toIsoTime(row.updated_at)
  }));
}

export function addMemory(memory) {
  db.run(
    'INSERT INTO memories (id, title, content, tags, mood, pinned) VALUES (?, ?, ?, ?, ?, ?)',
    [memory.id, memory.title, memory.content, JSON.stringify(memory.tags || []), memory.mood || 'neutral', memory.pinned ? 1 : 0]
  );
  saveDatabase();
}

export function updateMemory(id, updates) {
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.mood !== undefined) { fields.push('mood = ?'); values.push(updates.mood); }
  if (updates.pinned !== undefined) { fields.push('pinned = ?'); values.push(updates.pinned ? 1 : 0); }

  values.push(id);
  db.run(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();
}

export function deleteMemory(id) {
  db.run('DELETE FROM memories WHERE id = ?', [id]);
  saveDatabase();
}

export function toggleMemoryPin(id) {
  db.run('UPDATE memories SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  const updated = db.getRowsModified() > 0;
  saveDatabase();
  return updated;
}

// ===== 文档 =====

export function getDocuments() {
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    filename: row.filename,
    size: row.size,
    createdAt: toIsoTime(row.created_at)
  }));
}

export function addDocument(document) {
  db.run(
    'INSERT INTO documents (id, title, filename, content, size) VALUES (?, ?, ?, ?, ?)',
    [document.id, document.title, document.filename, document.content, document.size]
  );
  saveDatabase();
}

export function getDocument(id) {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    content: row.content,
    size: row.size,
    createdAt: toIsoTime(row.created_at)
  };
}

export function deleteDocument(id) {
  db.run('DELETE FROM documents WHERE id = ?', [id]);
  saveDatabase();
}

// 导出 db 供 routes/api.js 使用（更新群聊消息）
export function getDb() {
  return db;
}

// 供导出接口获取数据库文件路径
export function getDatabasePath() {
  return DB_PATH;
}
