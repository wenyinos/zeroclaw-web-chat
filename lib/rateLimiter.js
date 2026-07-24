import crypto from 'crypto';
import { log } from './logger.js';

// 配置（延迟读取，确保 dotenv 已加载）
function getConfig() {
  return {
    VERIFY_MAX_ATTEMPTS: Number(process.env.VERIFY_MAX_ATTEMPTS || 10),
    VERIFY_WINDOW_MS: Number(process.env.VERIFY_WINDOW_MS || 10 * 60 * 1000),
    VERIFY_BLOCK_MS: Number(process.env.VERIFY_BLOCK_MS || 15 * 60 * 1000)
  };
}

// 限流存储
const verifyAttempts = new Map();

export function getVerifyState(ip) {
  const { VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_MS } = getConfig();
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

export function registerVerifyFailure(ip) {
  const { VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_MS, VERIFY_BLOCK_MS } = getConfig();
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

export function clearVerifyAttempts(ip) {
  verifyAttempts.delete(ip);
}

export function verifyKeyMatch(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

export function validateAccessKeyStrength(key) {
  return key.length >= 12 && /[A-Za-z]/.test(key) && /\d/.test(key);
}

function cleanupVerifyAttempts() {
  const { VERIFY_WINDOW_MS } = getConfig();
  const now = Date.now();
  for (const [ip, info] of verifyAttempts.entries()) {
    const expiredWindow = now - info.windowStart > VERIFY_WINDOW_MS;
    const expiredBlock = !info.blockUntil || now > info.blockUntil;
    if (expiredWindow && expiredBlock) {
      verifyAttempts.delete(ip);
    }
  }
}

// 定期清理限流记录（延迟启动）
let cleanupTimer = null;
export function startRateLimiterCleanup() {
  if (cleanupTimer) return;
  const { VERIFY_WINDOW_MS } = getConfig();
  cleanupTimer = setInterval(cleanupVerifyAttempts, Math.min(VERIFY_WINDOW_MS, 10 * 60 * 1000));
  cleanupTimer.unref();
}
