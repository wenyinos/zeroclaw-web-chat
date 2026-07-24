import crypto from 'crypto';
import { log } from './logger.js';

// 配置（延迟读取，确保 dotenv 已加载）
function getConfig() {
  return {
    SESSION_TTL_MS: Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000)
  };
}

// 简单的会话存储（内存中）
export const sessions = new Map();

export function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  const { SESSION_TTL_MS } = getConfig();
  for (const [sessionId, session] of sessions.entries()) {
    if (!session?.verified || now - session.timestamp > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

export function isSessionValid(sessionId) {
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session?.verified) return false;
  const { SESSION_TTL_MS } = getConfig();
  if (Date.now() - session.timestamp > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

// 定期清理过期会话（延迟启动）
let cleanupTimer = null;
export function startSessionCleanup() {
  if (cleanupTimer) return;
  const { SESSION_TTL_MS } = getConfig();
  cleanupTimer = setInterval(cleanupExpiredSessions, Math.min(SESSION_TTL_MS, 30 * 60 * 1000));
  cleanupTimer.unref();
}
