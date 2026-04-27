# ZeroClaw Web Chat

English | [中文](./README.zh-CN.md)

A lightweight web chat interface for ZeroClaw AI Gateway (Bootstrap 5 + Node.js).

## Quick Start

```bash
npm install
npm start
```

Development mode:

```bash
npm run dev
```

Default URL: `http://localhost:3332`  
Sign in with `ACCESS_KEY` from your `.env` file.

> The default key `zeroclaw2026` is for development only. Replace it in production.

## Environment Variables (`.env`)

```env
ZEROCLOW_GATEWAY_URL=http://localhost:42617
PORT=3332
ACCESS_KEY=replace-with-strong-key
ZEROCLOW_TOKEN=your-token             # optional
SESSION_TTL_MS=43200000               # optional, default: 12h
ALLOWED_ORIGINS=http://localhost:3332 # optional, comma-separated
VERIFY_MAX_ATTEMPTS=10                # optional
VERIFY_WINDOW_MS=600000               # optional (10 min)
VERIFY_BLOCK_MS=900000                # optional (15 min)
```

## Core Features

- Access-key authentication with server-side session verification
- Streaming WebSocket chat (`/ws/chat` proxied to Gateway)
- Markdown rendering with light/dark theme
- Auto-saved chat records in `chat_records/<sessionId>.md`
- Session record modal for view, refresh, and download (download entry merged into history modal)
- Exported records keep only dialogue content (user/assistant), filtering tool/debug details
- Responsive chat width and denser typography for better on-screen information density
- Auto keepalive and reconnect when tab becomes inactive or connection drops

## Troubleshooting (WebSocket Handshake 401)

If the proxy connects and then immediately drops (`1006/1011`), the Gateway handshake usually failed authentication.

Verify handshake status by connecting to Gateway directly:

```bash
curl --http1.1 -sv "http://127.0.0.1:42617/ws/chat?session_id=test&token=<TOKEN>" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-api-key: <TOKEN>" \
  -H "x-zeroclaw-token: <TOKEN>" \
  -o /dev/null
```

- `HTTP/1.1 101 Switching Protocols`: Gateway handshake is healthy; inspect proxy/frontend state.
- `HTTP/1.1 401 Unauthorized`: Gateway pairing/token configuration mismatch.

Temporary restore:
- Set `gateway.require_pairing = false` in Gateway config, then restart daemon.

Restore secure baseline (recommended):
- Set `gateway.require_pairing = true` again.
- Generate a new token and update both:
  - Gateway `paired_tokens`
  - Web Chat `.env` `ZEROCLOW_TOKEN`
- Restart Gateway and Web Chat, then confirm handshake returns `101`.

## Security Notes

- Login endpoint includes rate limiting and temporary blocking.
- `/api/execute` only allows whitelisted commands and blocks injection characters.
- Configure `ALLOWED_ORIGINS` and use a strong access key.

## License

Apache License Version 2.0
