import Database from 'better-sqlite3';
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

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式（提高并发性能）
db.pragma('journal_mode = WAL');

// 初始化数据库表
export function initDatabase() {
  // 私聊消息表
  db.exec(`
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

  // 群聊消息表（按助手分别保存）
  db.exec(`
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

  // 助手配置表
  db.exec(`
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

  // 设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // 记忆表
  db.exec(`
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

  // 文档表
  db.exec(`
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_group_messages_assistant ON group_messages(assistant_id);
    CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned);
  `);

  // 插入默认助手（如果不存在）
  const defaultAssistants = [
    {
      id: 'default',
      name: 'Claw Agent',
      avatar: '🐾',
      system_prompt: '你是一个友好的AI助手，名叫Claw Agent。你乐于助人，善于沟通。',
      color: '#c97b5a',
      triggers: JSON.stringify(['@claw', '@agent']),
      is_default: 1
    },
    {
      id: 'coder',
      name: 'Code Bot',
      avatar: '💻',
      system_prompt: '你是一个专业的程序员助手。你擅长写代码、调试、解释技术概念。回复时优先提供代码示例。',
      color: '#6fb1ff',
      triggers: JSON.stringify(['@coder', '@代码']),
      is_default: 0
    },
    {
      id: 'writer',
      name: 'Writer',
      avatar: '✍️',
      system_prompt: '你是一个创意写作助手。你擅长写文章、故事、文案。回复时注重文采和创意。',
      color: '#8aa97f',
      triggers: JSON.stringify(['@writer', '@写作']),
      is_default: 0
    }
  ];

  const insertAssistant = db.prepare(`
    INSERT OR IGNORE INTO assistants (id, name, avatar, system_prompt, color, triggers, is_default)
    VALUES (@id, @name, @avatar, @system_prompt, @color, @triggers, @is_default)
  `);

  for (const assistant of defaultAssistants) {
    insertAssistant.run(assistant);
  }

  console.log('✅ 数据库初始化完成');
}

// ===== 私聊消息操作 =====

export function addChatMessage(sessionId, message) {
  const stmt = db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, thinking, images, favorite, parent_msg_id)
    VALUES (@id, @session_id, @role, @content, @thinking, @images, @favorite, @parent_msg_id)
  `);

  return stmt.run({
    id: message.id,
    session_id: sessionId,
    role: message.role,
    content: message.content || '',
    thinking: message.thinking || '',
    images: JSON.stringify(message.images || []),
    favorite: message.favorite ? 1 : 0,
    parent_msg_id: message.parentMsgId || null
  });
}

export function getChatMessages(sessionId, limit = 80) {
  const stmt = db.prepare(`
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(sessionId, limit).reverse();
  return rows.map(row => ({
    id: row.id,
    role: row.role,
    content: row.content,
    thinking: row.thinking,
    images: JSON.parse(row.images || '[]'),
    favorite: row.favorite === 1,
    parentMsgId: row.parent_msg_id,
    timestamp: row.created_at
  }));
}

export function deleteChatMessage(id) {
  const stmt = db.prepare('DELETE FROM chat_messages WHERE id = ?');
  return stmt.run(id);
}

export function toggleChatMessageFavorite(id) {
  const stmt = db.prepare('UPDATE chat_messages SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?');
  return stmt.run(id);
}

export function getChatSessions() {
  const stmt = db.prepare(`
    SELECT session_id, MIN(created_at) as created_at, MAX(created_at) as updated_at, COUNT(*) as message_count
    FROM chat_messages
    GROUP BY session_id
    ORDER BY updated_at DESC
  `);
  const rows = stmt.all();
  return rows.map(row => ({
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count
  }));
}

// ===== 群聊消息操作 =====

export function addGroupMessage(message) {
  const stmt = db.prepare(`
    INSERT INTO group_messages (id, assistant_id, sender, role, content, thinking, images, avatar, color, favorite, parent_msg_id)
    VALUES (@id, @assistant_id, @sender, @role, @content, @thinking, @images, @avatar, @color, @favorite, @parent_msg_id)
  `);

  return stmt.run({
    id: message.id,
    assistant_id: message.assistantId || 'default',
    sender: message.sender,
    role: message.role,
    content: message.content || '',
    thinking: message.thinking || '',
    images: JSON.stringify(message.images || []),
    avatar: message.avatar || '🤖',
    color: message.color || '#c97b5a',
    favorite: message.favorite ? 1 : 0,
    parent_msg_id: message.parentMsgId || null
  });
}

export function getGroupMessages(assistantId = null, limit = 80) {
  let stmt;
  if (assistantId) {
    stmt = db.prepare(`
      SELECT * FROM group_messages
      WHERE assistant_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(assistantId, limit).reverse().map(formatGroupMessage);
  } else {
    stmt = db.prepare(`
      SELECT * FROM group_messages
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).reverse().map(formatGroupMessage);
  }
}

function formatGroupMessage(row) {
  return {
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
    timestamp: row.created_at
  };
}

export function deleteGroupMessage(id) {
  const stmt = db.prepare('DELETE FROM group_messages WHERE id = ?');
  return stmt.run(id);
}

export function toggleGroupMessageFavorite(id) {
  const stmt = db.prepare('UPDATE group_messages SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?');
  return stmt.run(id);
}

export function clearGroupMessages(assistantId = null) {
  if (assistantId) {
    const stmt = db.prepare('DELETE FROM group_messages WHERE assistant_id = ?');
    return stmt.run(assistantId);
  } else {
    const stmt = db.prepare('DELETE FROM group_messages');
    return stmt.run();
  }
}

// ===== 助手操作 =====

export function getAssistants() {
  const stmt = db.prepare('SELECT * FROM assistants ORDER BY is_default DESC, created_at ASC');
  const rows = stmt.all();
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
  const row = stmt.get(id);
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
  const row = stmt.get();
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
  const stmt = db.prepare(`
    INSERT INTO assistants (id, name, avatar, system_prompt, color, triggers, is_default)
    VALUES (@id, @name, @avatar, @system_prompt, @color, @triggers, @is_default)
  `);

  return stmt.run({
    id: assistant.id,
    name: assistant.name,
    avatar: assistant.avatar || '🤖',
    system_prompt: assistant.systemPrompt,
    color: assistant.color || '#6fb1ff',
    triggers: JSON.stringify(assistant.triggers || []),
    is_default: assistant.isDefault ? 1 : 0
  });
}

export function updateAssistant(id, updates) {
  const fields = [];
  const values = {};

  if (updates.name !== undefined) {
    fields.push('name = @name');
    values.name = updates.name;
  }
  if (updates.avatar !== undefined) {
    fields.push('avatar = @avatar');
    values.avatar = updates.avatar;
  }
  if (updates.systemPrompt !== undefined) {
    fields.push('system_prompt = @system_prompt');
    values.system_prompt = updates.systemPrompt;
  }
  if (updates.color !== undefined) {
    fields.push('color = @color');
    values.color = updates.color;
  }
  if (updates.triggers !== undefined) {
    fields.push('triggers = @triggers');
    values.triggers = JSON.stringify(updates.triggers);
  }

  if (fields.length === 0) return null;

  values.id = id;
  const stmt = db.prepare(`UPDATE assistants SET ${fields.join(', ')} WHERE id = @id`);
  return stmt.run(values);
}

export function deleteAssistant(id) {
  const stmt = db.prepare('DELETE FROM assistants WHERE id = ? AND is_default = 0');
  return stmt.run(id);
}

// ===== 设置操作 =====

export function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  return stmt.run(key, value);
}

export function getAllSettings() {
  const stmt = db.prepare('SELECT * FROM settings');
  const rows = stmt.all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ===== 记忆操作 =====

export function getMemories() {
  const stmt = db.prepare('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC');
  const rows = stmt.all();
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    mood: row.mood,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function addMemory(memory) {
  const stmt = db.prepare(`
    INSERT INTO memories (id, title, content, tags, mood, pinned)
    VALUES (@id, @title, @content, @tags, @mood, @pinned)
  `);

  return stmt.run({
    id: memory.id,
    title: memory.title,
    content: memory.content,
    tags: JSON.stringify(memory.tags || []),
    mood: memory.mood || 'neutral',
    pinned: memory.pinned ? 1 : 0
  });
}

export function updateMemory(id, updates) {
  const fields = ['updated_at = CURRENT_TIMESTAMP'];
  const values = { id };

  if (updates.title !== undefined) {
    fields.push('title = @title');
    values.title = updates.title;
  }
  if (updates.content !== undefined) {
    fields.push('content = @content');
    values.content = updates.content;
  }
  if (updates.tags !== undefined) {
    fields.push('tags = @tags');
    values.tags = JSON.stringify(updates.tags);
  }
  if (updates.mood !== undefined) {
    fields.push('mood = @mood');
    values.mood = updates.mood;
  }
  if (updates.pinned !== undefined) {
    fields.push('pinned = @pinned');
    values.pinned = updates.pinned ? 1 : 0;
  }

  const stmt = db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = @id`);
  return stmt.run(values);
}

export function deleteMemory(id) {
  const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
  return stmt.run(id);
}

export function toggleMemoryPin(id) {
  const stmt = db.prepare('UPDATE memories SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  return stmt.run(id);
}

// ===== 文档操作 =====

export function getDocuments() {
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
  const rows = stmt.all();
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    filename: row.filename,
    size: row.size,
    createdAt: row.created_at
  }));
}

export function addDocument(document) {
  const stmt = db.prepare(`
    INSERT INTO documents (id, title, filename, content, size)
    VALUES (@id, @title, @filename, @content, @size)
  `);

  return stmt.run({
    id: document.id,
    title: document.title,
    filename: document.filename,
    content: document.content,
    size: document.size
  });
}

export function getDocument(id) {
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  const row = stmt.get(id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    content: row.content,
    size: row.size,
    createdAt: row.created_at
  };
}

export function deleteDocument(id) {
  const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
  return stmt.run(id);
}

// 关闭数据库
export function closeDatabase() {
  db.close();
}

export { db };
