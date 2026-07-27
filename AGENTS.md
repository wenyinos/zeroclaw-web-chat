# Repository Guidelines

ZeroClaw Web Chat — lightweight web UI that does access-key auth + WebSocket proxying + message persistence. No AI logic lives here; real inference happens in an external Gateway selected by `AI_BACKEND` (`zeroclaw` | `picoclaw`). No bundler, no framework, no tests, no linter.

**Read `CLAUDE.md` before any non-trivial change.** It captures the load-bearing gotchas (two distinct sessionId concepts, WS dialect translation between zeroclaw/picoclaw, sql.js full-rewrite-per-write, lazy `process.env` reads, single-file `ClawAgent` class, network-first Service Worker). This file only adds contribution/operational guidance and does not repeat that architecture.

## Entry points
- `server.js` — wiring only: dotenv, CORS, static serving, API router mount, WS proxy setup, cleanup intervals, signal handlers. Real logic lives in:
  - `routes/api.js` — all REST endpoints + SSE + sticker file I/O + in-memory console events
  - `lib/ws-proxy.js` — `/ws/chat` upgrade handling + Gateway dialect translation + keepalive/reconnect
  - `lib/database.js` — sql.js (WASM, in-memory) layer; every write re-exports the whole `data/chat.db`
  - `lib/sessions.js`, `lib/rateLimiter.js`, `lib/logger.js`, `lib/utils.js`
- Frontend (vanilla ES modules, no build step): `public/index.html`, `public/js/chat.js` (single `ClawAgent` class on `window.app`, called via inline `onclick` — renaming methods breaks links silently), `public/css/style.css`, `public/sw.js`, `public/manifest.json`.

## Commands
- `npm install` — install dependencies.
- `npm start` — production mode; default `PORT=3332`, binds `0.0.0.0`.
- `npm run dev` — `node --watch server.js` (auto-reload on change).
- No test / lint / typecheck / build scripts exist. Manual smoke after changes: `POST /api/verify` with body `{ "key": "<ACCESS_KEY>" }` → load `/` → WebSocket `/ws/chat?auth_session=<sessionId>` round-trips → refresh keeps history.

## Code style
- ES Modules (`"type": "module"`), semicolons kept.
- Indentation: **backend JS 2 spaces, frontend JS/CSS 4 spaces** — do not normalize.
- camelCase for JS; DB columns are snake_case, mapped in `lib/database.js`.
- Comments and log strings are in Chinese; match the surrounding file.
- No ESLint/Prettier committed — follow the file you are in and keep diffs minimal.

## Commits & PRs
- Conventional Commits, e.g. `feat(chat): add reconnect logic`, `fix(api): validate token`.
- Atomic; never mix backend and frontend in one commit.
- PRs should include purpose, key changes, validation steps, and screenshots/GIFs for UI updates; call out any `.env` or deployment-impacting changes.

## Security & configuration
- Never commit real secrets; `.env.example` holds placeholders only.
- `.env`, `data/` (incl. `chat.db`), `*.log`, `chat_records/` are gitignored. Config edits touch `.env.example` placeholders, never real values.
- `ACCESS_KEY` default `zeroclaw2026` is dev-only; `routes/api.js` enforces ≥12 chars (letters + digits) under `NODE_ENV=production` at startup.
- `/api/execute` is high-risk: the allowlist is `Map<binary, allowedArgArrays>` with exact-match + a char blacklist (`[;&|\`$(){}!<>]`) + `execFile(..., { shell: false })`. Only ever tighten, never loosen.
- `ALLOWED_ORIGINS` empty = deny all cross-origin requests (not allow all).
- Every API except `GET /api/config` and `POST /api/verify` goes through the `requireVerifiedSession` middleware.
