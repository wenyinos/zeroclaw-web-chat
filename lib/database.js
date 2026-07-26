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

  // 创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)');
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

  // 保存数据库
  saveDatabase();

  console.log('✅ 数据库初始化完成');
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

// 保存数据库到文件
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ===== 私聊消息 =====

export function addChatMessage(sessionId, message) {
  db.run(
    'INSERT INTO chat_messages (id, session_id, role, content, thinking, images, favorite, parent_msg_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, sessionId, message.role, message.content || '', message.thinking || '', JSON.stringify(message.images || []), message.favorite ? 1 : 0, message.parentMsgId || null]
  );
  saveDatabase();
}

export function getChatMessages(sessionId, limit = 80) {
  const stmt = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
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
  saveDatabase();
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
    'INSERT INTO group_messages (id, assistant_id, sender, role, content, thinking, images, avatar, color, favorite, parent_msg_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, message.assistantId || 'default', message.sender, message.role, message.content || '', message.thinking || '', JSON.stringify(message.images || []), message.avatar || '🤖', message.color || '#c97b5a', message.favorite ? 1 : 0, message.parentMsgId || null]
  );
  saveDatabase();
}

export function getGroupMessages(assistantId = null, limit = 80) {
  let rows;
  if (assistantId) {
    const stmt = db.prepare('SELECT * FROM group_messages WHERE assistant_id = ? ORDER BY created_at DESC LIMIT ?');
    stmt.bind([assistantId, limit]);
    rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
  } else {
    const stmt = db.prepare('SELECT * FROM group_messages ORDER BY created_at DESC LIMIT ?');
    stmt.bind([limit]);
    rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
  }
  return rows.reverse().map(row => ({
    id: row.id,
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
  saveDatabase();
}

export function clearGroupMessages(assistantId = null) {
  if (assistantId) {
    db.run('DELETE FROM group_messages WHERE assistant_id = ?', [assistantId]);
  } else {
    db.run('DELETE FROM group_messages');
  }
  saveDatabase();
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
  saveDatabase();
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
