# ZeroClaw Web Chat

## Project Type
Single-file Node.js server (ESM) with Bootstrap 5 frontend. No monorepo, no packages, no tests.

## Entry Point
- `server.js` — Express + WebSocket server, ES Module (`"type": "module"` in package.json)
- `public/` — Static frontend assets served by Express

## Dev Commands
```bash
npm install
npm start       # node server.js
npm run dev     # node --watch server.js
```
No lint, typecheck, or test scripts are configured.

## Environment
- `.env` is loaded with `dotenv.config({ override: true })` — file vars override system env
- Defaults: `PORT=3332`, `ZEROCLOW_GATEWAY_URL=http://localhost:8190` (fallback in server.js; `.env.example` shows 42617), `ACCESS_KEY=zeroclaw2026`
- `server.log` is appended to alongside stdout (logStream opened at startup)

## Architecture
- Browser → Node.js (port 3332) → ZeroClaw Gateway (port 42617) via WebSocket proxy at `/ws/chat`
- Access key auth via `POST /api/verify`; session IDs stored in-memory Map
- Shell command execution restricted to a hardcoded allowlist (system info commands only)

## Key Quirks
- ESM throughout — use `import`/`export`, not CommonJS `require()`
- Server binds to `0.0.0.0` (accessible externally, not just localhost)
- WebSocket proxy only handles the `/ws/chat` path; other upgrade requests are ignored
- `wss` is created with `noServer: true` and manually handled via `server.on('upgrade', ...)`
- Shell commands restricted to hardcoded allowlist: `uname`, `hostname`, `uptime`, `df`, `free`, `top`, `ps`, `whoami`, `date`, `pwd`, `ls`, `cat`, `echo`, `wc`, `head`, `tail`, `grep`, `id`
