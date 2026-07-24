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

## Environment Variables

See `.env.example` for all available configuration options.

## Core Features

- Access-key authentication with server-side session verification
- **Multi-backend support**: Switch between ZeroClaw and PicoClaw via `AI_BACKEND` environment variable
- Streaming WebSocket chat (`/ws/chat` proxied to Gateway)
- **Image upload**: Send images to PicoClaw for vision recognition (PicoClaw mode only)
- Markdown rendering with light/dark theme
- Auto-saved chat records in SQLite database
- **Session management**: New chat, resume previous session, delete session
- Exported records keep only dialogue content (user/assistant), filtering tool/debug details
- Responsive chat width and denser typography for better on-screen information density
- Auto keepalive and reconnect when tab becomes inactive or connection drops

## New Features

### Multi-Assistant Group Chat

- Multiple AI assistants in one chat room
- 3 default assistants: Claw Agent, Code Bot, Writer
- **@mention trigger**: Type `@coder` or `@writer` to target specific assistant
- **All reply mode**: Send without @mention, all assistants reply simultaneously
- **Assistant settings**: Customize name, avatar, system prompt, triggers
- Group messages stored separately by assistant ID

### SQLite Database Storage

- All messages stored in `data/chat.db`
- Separate tables for private chat, group chat, settings, memories, documents
- Auto-initialization on first run (no manual setup needed)
- WAL mode for better concurrent performance

### URL-based Session

- Session ID in URL: `http://localhost:3332?session=xxx`
- Share URL to share complete conversation
- "Continue chat" from history jumps to correct session URL
- Messages persist across page refreshes

### Emoji Sticker Panel

- 20 built-in emoji stickers
- Click to insert emoji character into message
- Custom sticker upload support

### Settings Panel

- Username and assistant name customization
- Theme selection (light/dark)
- Browser notification toggle
- Settings synced via SSE

### Real-time Updates (SSE)

- Server-Sent Events for live updates
- Settings, messages, and events sync across tabs
- Auto-reconnect on connection drop

### PWA Support

- Service Worker for offline caching
- Installable as desktop/mobile app
- Manifest.json included

## Architecture

```
server.js              # Main entry (config, startup)
lib/
  logger.js            # Logging module
  sessions.js          # Session management
  rateLimiter.js       # Rate limiting
  utils.js             # Utility functions
  ws-proxy.js          # WebSocket proxy
  database.js          # SQLite database module
routes/
  api.js               # REST API routes
data/
  chat.db              # SQLite database (auto-created)
public/
  index.html           # Main HTML
  css/style.css        # Styles (warm color scheme)
  js/chat.js           # Frontend logic
  sw.js                # Service Worker
  manifest.json        # PWA manifest
```

## API Endpoints

### Authentication
- `POST /api/verify` - Verify access key

### Configuration
- `GET /api/config` - Get server configuration
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update settings

### Private Chat
- `GET /api/chat/messages` - Get chat messages
- `POST /api/chat/send` - Send message

### Group Chat
- `GET /api/group/messages` - Get group messages
- `POST /api/group/send` - Send group message
- `POST /api/group/reply` - Assistant reply

### Assistants
- `GET /api/assistants` - List assistants
- `POST /api/assistants` - Create assistant
- `PUT /api/assistants/:id` - Update assistant
- `DELETE /api/assistants/:id` - Delete assistant

### Sessions
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/forge` - Clean session

### Other
- `GET /api/stickers` - List stickers
- `POST /api/stickers` - Upload sticker
- `GET /api/memories` - List memories
- `GET /api/documents` - List documents
- `GET /api/stream` - SSE endpoint

## Deployment

### Prerequisites

- Node.js 18+
- npm or yarn

### Steps

1. **Clone repository**
   ```bash
   git clone https://github.com/your-username/zeroclaw-web-chat.git
   cd zeroclaw-web-chat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start server**
   ```bash
   # Production
   npm start

   # Development (auto-reload)
   npm run dev
   ```

5. **Access**
   Open `http://localhost:3332` in browser

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3332
CMD ["node", "server.js"]
```

```bash
docker build -t zeroclaw-web-chat .
docker run -p 3332:3332 -v ./data:/app/data zeroclaw-web-chat
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://localhost:3332;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup

Backup the `data/` directory to preserve:
- `chat.db` - All messages and settings
- `stickers/` - Custom stickers

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

## Security Notes

- Login endpoint includes rate limiting and temporary blocking.
- `/api/execute` only allows whitelisted commands and blocks injection characters.
- Configure `ALLOWED_ORIGINS` and use a strong access key.
- SQLite database file should be backed up regularly.

## License

Apache License Version 2.0
