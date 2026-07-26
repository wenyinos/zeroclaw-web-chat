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
- WebSocket chat (`/ws/chat` proxied to Gateway)
- **Wait feedback and typewriter rendering**: typing indicator appears on send, reply is revealed progressively
- **Message actions**: copy, reply, favorite, delete, regenerate
- **Stop**: halt the typewriter animation and show the full received content immediately
- **Image upload**: Send images to PicoClaw for vision recognition (PicoClaw mode only)
- Markdown rendering (code blocks keep indentation and line breaks, long lines scroll horizontally) with light/dark theme
- Auto-saved chat records in SQLite database
- **Session management**: create, resume, export as Markdown, delete — separately for direct and group chats
- Exported records keep only dialogue content, filtering tool/debug details
- Responsive chat width and denser typography for better on-screen information density
- Auto keepalive and reconnect when tab becomes inactive or connection drops

## New Features

### Multi-Assistant Group Chat

- Multiple AI assistants in one chat room
- 3 default assistants: Claw Agent, Code Bot, Writer
- **@mention trigger**: Type `@coder` or `@writer` to target specific assistant
- **All reply mode**: Send without @mention, all assistants reply **one after another** (see note)
- **Assistant settings**: Customize name, avatar, system prompt, triggers — each assistant answers in its own persona
- **Session management**: same as direct chat — create, switch, resume, export, delete
- Timeout guard: an assistant that stays silent for 90s is marked, then the next one proceeds

> **Why sequential, not simultaneous**: one WebSocket maps to a single agent session on the
> Gateway. Sending N requests at once yields only one complete reply — the rest return
> thinking output only, leaving those assistants stuck on "thinking...". So each request now
> waits for the previous reply to land. The cost is latency growing linearly with the number
> of assistants (~30s for three).

### SQLite Database Storage

- All messages stored in `data/chat.db` (sql.js / WASM)
- Separate tables for private chat, group chat, settings, memories, documents
- Auto-initialization on first run, automatic column migration on upgrade — no manual steps
- Every write rewrites the whole database file, so binary content (images, stickers) lives on the filesystem instead

> **Upgrade note**: this version adds a `session_id` column to `group_messages`. It is detected
> and applied via `ALTER TABLE` on startup, and existing group messages are moved into a
> history session named `group-legacy` — nothing is lost. The migration rewrites in place with
> no rollback, so back up `data/chat.db` before upgrading.

### URL-based Session

- Direct chat session: `http://localhost:3332?session=xxx`
- Group chat session: `http://localhost:3332?group=xxx`
- Share URL to share complete conversation
- "Continue chat" from history jumps to correct session URL
- Messages persist across page refreshes

### Memory (long-term context)

Set `MEMORY_ENABLED=true` to show this tab — it is off by default.

- **Upload Markdown**: import `.md` files as memories; filename becomes the title, body becomes the content
- **Only pinned memories are sent**: just the 📌 pinned ones ride along with your message, keeping context cost under control
- The UI always shows exactly what you typed — memories are only appended to the payload sent to the Gateway
- Also supports hand-written memories, keyword search, and a 100KB per-entry limit

```
Memory list
⭐ coding-preferences.md   ← sent with the conversation
⭐ project-background.md   ← sent with the conversation
☆  meeting-notes.md       ← not sent
```

### Sticker Panel

- 20 built-in emoji, click to insert into the input box
- **Custom stickers**: uploads are stored as files under `data/stickers/`, served by the `/stickers` static route
- Limited to png/jpg/gif/webp at 2MB each; deletion validates the filename against a whitelist and confirms directory containment

### Settings Panel

- Username and assistant name customization
- Theme selection (light/dark)
- Browser notification toggle
- Settings changes are pushed over SSE to other open tabs

### Real-time Updates (SSE)

- `GET /api/stream` opens the connection, sends a snapshot first, then a heartbeat every 25s
- Currently only **settings changes** are broadcast; the message and console-event broadcasts are wired on the client but not yet emitted by the server
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
  stickers/            # custom sticker files (auto-created)
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
- `DELETE /api/chat/messages/:id` - Delete message
- `POST /api/chat/messages/:id/favorite` - Toggle favorite

### Group Chat
- `GET /api/group/messages` - Get group messages (filterable by `session_id` / `assistant_id`)
- `POST /api/group/send` - Send group message
- `POST /api/group/reply` - Assistant reply
- `PUT /api/group/messages/:id` - Update message content
- `DELETE /api/group/messages/:id` - Delete message

### Group Sessions
- `GET /api/group/sessions` - List group chat sessions
- `GET /api/group/sessions/:id` - Get session details (includes Markdown for export)
- `DELETE /api/group/sessions/:id` - Delete an entire session

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

### Memories and Documents
- `GET /api/memories` - List memories
- `POST /api/memories` - Create memory (Markdown upload reuses this endpoint)
- `PUT /api/memories/:id` - Update memory
- `POST /api/memories/:id/pin` - Toggle pin (controls whether it is sent with the conversation)
- `DELETE /api/memories/:id` - Delete memory
- `GET /api/documents` - List documents

### Other
- `GET /api/stickers` - List stickers
- `POST /api/stickers` - Upload sticker (data URL, written to `data/stickers/`)
- `DELETE /api/stickers/:id` - Delete sticker
- `POST /api/execute` - Run a whitelisted system-info command
- `GET /api/console/events` - List console events
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
