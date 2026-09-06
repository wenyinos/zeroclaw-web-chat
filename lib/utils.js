import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CHAT_RECORDS_DIR = path.join(__dirname, '..', 'chat_records');

export function getHeaderValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function getClientIp(req) {
  const forwardedFor = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwardedFor && typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function normalizeIp(ip) {
  return ip.startsWith('::ffff:') ? ip.substring(7) : ip;
}

export function sanitizeSessionId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) return '';
  return trimmed;
}

export function formatDateTimeText(value) {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(value);
  }
}

export function escapeMarkdown(text) {
  return String(text ?? '').replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

export function buildSessionMarkdown(sessionId, messages) {
  const lines = [];

  // 系统注入的占位/错误文案，导出时会冒充真实对话
  const systemArtifacts = [
    /^工具\s+`.+`\s+执行完成，输出\s+\d+\s+字符。$/,
    /^正在思考\.\.\.$/,
    /^（等待回复超时，未收到该助手的回应）$/,
    /^（回复已丢失：.*）$/,
    /^连接断开，(无法获取回复|未收到该助手的完整回复)$/
  ];

  messages.forEach((message) => {
    // 过滤工具调用及其调试输出，仅保留真实对话
    if (message?.toolCall) return;

    const rawRole = String(message?.role || '').toLowerCase();
    // 群聊消息带 sender（用户名或助手名），私聊没有则回退到角色
    const roleLabel = message?.sender || (rawRole === 'user' ? '用户' : '助手');
    const content = String(message?.content || '').trim();
    const images = Array.isArray(message?.images) ? message.images : [];

    // 系统文案不导出；纯图片消息保留占位说明，不整条丢失
    if (systemArtifacts.some(re => re.test(content))) return;
    if (!content && images.length > 0) {
      lines.push(`## ${roleLabel}`);
      lines.push('');
      lines.push(`（发送了 ${images.length} 张图片）`);
      lines.push('');
      return;
    }
    if (!content) return;

    lines.push(`## ${roleLabel}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  });

  return lines.join('\n').trim();
}

export function ensureChatRecordsDir() {
  if (!fs.existsSync(CHAT_RECORDS_DIR)) {
    fs.mkdirSync(CHAT_RECORDS_DIR, { recursive: true });
  }
}
