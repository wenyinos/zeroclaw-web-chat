import WebSocket, { WebSocketServer } from 'ws';
import { URL } from 'url';
import { log } from './logger.js';
import { cleanupExpiredSessions, isSessionValid } from './sessions.js';

export const wss = new WebSocketServer({ noServer: true });

export function setupWsProxy(server) {
  // 配置（在函数内读取，确保 dotenv 已加载）
  const AI_BACKEND = (process.env.AI_BACKEND || 'zeroclaw').toLowerCase();
  const USE_PICOCLAW = AI_BACKEND === 'picoclaw';
  const GATEWAY_URL = process.env.ZEROCLOW_GATEWAY_URL || 'http://localhost:8190';
  const TOKEN = process.env.ZEROCLOW_TOKEN;
  const PICOCLAW_URL = process.env.PICOCLAW_GATEWAY_URL || 'http://localhost:18790';
  const PICOCLAW_TOKEN = process.env.PICOCLAW_TOKEN || '';
  const WS_KEEPALIVE_INTERVAL_MS = Number(process.env.WS_KEEPALIVE_INTERVAL_MS || 25000);
  const WS_KEEPALIVE_MAX_MISSES = Number(process.env.WS_KEEPALIVE_MAX_MISSES || 6);

  const gatewayWsUrl = USE_PICOCLAW
    ? PICOCLAW_URL.replace(/^http/, 'ws')
    : GATEWAY_URL.replace(/^http/, 'ws');
  const gatewayWsPath = USE_PICOCLAW ? '/pico/ws' : '/ws/chat';

  log('info', `🔄 WebSocket 代理: 将 /ws/chat 代理到 ${gatewayWsUrl}${gatewayWsPath}`);
  log('info', `   - 后端: ${USE_PICOCLAW ? 'PicoClaw' : 'ZeroClaw'}`);

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    let authSessionId = '';
    let requestToken = '';
    let parsedUrl;
    let normalizedSearchParams;
    try {
      const rawUpgradeUrl = String(request.url || '');
      const normalizedUpgradeUrl = rawUpgradeUrl.replace(/&amp;/gi, '&');
      if (rawUpgradeUrl !== normalizedUpgradeUrl) {
        log('warn', '检测到升级请求 URL 含 HTML 实体编码，已自动规范化');
      }

      parsedUrl = new URL(normalizedUpgradeUrl, `http://${request.headers.host}`);
      normalizedSearchParams = new URLSearchParams();
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        // 兼容错误编码键名，如 amp;token。
        const normalizedKey = key.replace(/^amp;/i, '');
        normalizedSearchParams.append(normalizedKey, value);
      }

      pathname = parsedUrl.pathname;
      authSessionId = normalizedSearchParams.get('auth_session') || '';
      requestToken = (normalizedSearchParams.get('token') || '').trim();
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

        // 连接到 Gateway（移除仅用于本地鉴权的 auth_session 参数）
        const gatewayToken = USE_PICOCLAW ? (PICOCLAW_TOKEN || '') : (requestToken || TOKEN || '');
        const gatewayQuery = new URLSearchParams(normalizedSearchParams);
        gatewayQuery.delete('auth_session');
        if (!gatewayQuery.get('token') && gatewayToken && !USE_PICOCLAW) {
          gatewayQuery.set('token', gatewayToken);
        }
        const targetUrl = `${gatewayWsUrl}${gatewayWsPath}${gatewayQuery.toString() && !USE_PICOCLAW ? `?${gatewayQuery.toString()}` : ''}`;
        log('info', `   - 连接到 Gateway: ${targetUrl}`);
        log('info', `   - Gateway 鉴权: ${gatewayToken ? '已携带 token' : '未携带 token'}`);

        const gatewayHeaders = gatewayToken
          ? {
              Authorization: gatewayToken.startsWith('Bearer ') ? gatewayToken : `Bearer ${gatewayToken}`,
              ...(USE_PICOCLAW ? {} : { 'x-api-key': gatewayToken, 'x-zeroclaw-token': gatewayToken })
            }
          : {};
        const gatewayWs = new WebSocket(targetUrl, { headers: gatewayHeaders });
        let clientAlive = true;
        let gatewayAlive = true;
        let clientMisses = 0;
        let gatewayMisses = 0;
        let gatewayReady = false;
        const pendingMessages = [];

        const cleanupKeepalive = () => {
          if (keepaliveTimer) {
            clearInterval(keepaliveTimer);
          }
        };

        const keepaliveTimer = setInterval(() => {
          if (clientWs.readyState === WebSocket.OPEN) {
            if (!clientAlive) {
              clientMisses += 1;
              if (clientMisses >= WS_KEEPALIVE_MAX_MISSES) {
                log('warn', '⚠️ [WebSocket 代理] 客户端连接心跳超时，主动断开');
                clientWs.terminate();
              }
            } else {
              clientMisses = 0;
              clientAlive = false;
              clientWs.ping();
            }
          }

          if (gatewayWs.readyState === WebSocket.OPEN) {
            if (!gatewayAlive) {
              gatewayMisses += 1;
              if (gatewayMisses >= WS_KEEPALIVE_MAX_MISSES) {
                log('warn', '⚠️ [WebSocket 代理] Gateway 连接心跳超时，主动断开');
                gatewayWs.terminate();
              }
            } else {
              gatewayMisses = 0;
              gatewayAlive = false;
              gatewayWs.ping();
            }
          }
        }, WS_KEEPALIVE_INTERVAL_MS);
        keepaliveTimer.unref();

        // 客户端 -> Gateway（协议转换）
        let picoMsgId = 0;

        const sendToGateway = (raw) => {
          if (USE_PICOCLAW) {
            try {
              const msg = JSON.parse(raw);
              if (msg.type === 'message') {
                picoMsgId += 1;
                const payload = { content: msg.content };

                // 添加图片
                if (msg.images && Array.isArray(msg.images)) {
                  payload.media = msg.images;
                }

                // 添加上下文（历史消息）
                if (msg.context && Array.isArray(msg.context)) {
                  payload.context = msg.context;
                }

                // 添加助手信息（群聊）
                if (msg.systemPrompt) {
                  payload.systemPrompt = msg.systemPrompt;
                }

                const outMsg = JSON.stringify({
                  type: 'message.send',
                  id: `msg-${picoMsgId}`,
                  payload
                });
                gatewayWs.send(outMsg);
                return;
              }
            } catch (e) { /* 非 JSON，直接转发 */ }
          }
          gatewayWs.send(raw);
        };

        clientWs.on('message', (data) => {
          clientAlive = true;
          const raw = data.toString();
          if (gatewayReady) {
            sendToGateway(raw);
          } else {
            pendingMessages.push(raw);
          }
        });

        // Gateway -> 客户端（协议转换）
        gatewayWs.on('message', (data) => {
          gatewayAlive = true;
          if (clientWs.readyState === WebSocket.OPEN) {
            const raw = data.toString();
            if (USE_PICOCLAW) {
              try {
                const msg = JSON.parse(raw);
                // picoclaw typing.start/stop → zeroclaw typing.start/stop（兼容）
                if (msg.type === 'typing.start' || msg.type === 'typing.stop') {
                  clientWs.send(JSON.stringify({ type: msg.type }));
                  return;
                }
                // picoclaw message.create → zeroclaw message
                if (msg.type === 'message.create' && msg.payload) {
                  const p = msg.payload;
                  if (p.thought) {
                    // 思考内容
                    clientWs.send(JSON.stringify({ type: 'thinking', content: p.content }));
                  } else {
                    // 普通消息
                    clientWs.send(JSON.stringify({
                      type: 'message',
                      content: p.content,
                      context_usage: p.context_usage
                    }));
                  }
                  return;
                }
                // picoclaw error → zeroclaw error（兼容）
                if (msg.type === 'error') {
                  clientWs.send(JSON.stringify({
                    type: 'error',
                    code: msg.payload?.code || 'unknown',
                    message: msg.payload?.message || 'Unknown error'
                  }));
                  return;
                }
              } catch (e) { /* 非 JSON，直接转发 */ }
            }
            clientWs.send(raw);
          }
        });

        clientWs.on('pong', () => {
          clientAlive = true;
          clientMisses = 0;
        });

        gatewayWs.on('pong', () => {
          gatewayAlive = true;
          gatewayMisses = 0;
        });

        gatewayWs.on('open', () => {
          log('info', `✅ [WebSocket 代理] 已连接到 Gateway`);
          gatewayReady = true;
          // 发送缓存的消息
          while (pendingMessages.length > 0) {
            sendToGateway(pendingMessages.shift());
          }
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
            // 1005 和 1006 是保留码，不能用于关闭
            const closeCode = (code === 1005 || code === 1006) ? 1000 : code;
            gatewayWs.close(closeCode, reason);
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
}
