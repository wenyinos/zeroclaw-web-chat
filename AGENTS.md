# Repository Guidelines

## Project Structure & Module Organization
- `server.js` is the backend entrypoint (Express + WebSocket proxy) and serves static assets from `public/`.
- `public/index.html` defines the UI shell; interactive logic is in `public/js/chat.js`; styling is in `public/css/style.css`.
- Runtime/config files: `.env` (local secrets), `.env.example` (template), `server.log` (local logs).
- Dependency and scripts are defined in `package.json`; lockfile is `package-lock.json`.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm start` — run production-style server on `PORT` (default `3332`).
- `npm run dev` — run `server.js` with Node watch mode for local iteration.
- No test script is currently defined. For validation, run the app and verify key flows:
  - auth (`/api/verify`)
  - config load (`/api/config`)
  - chat WebSocket path (`/ws/chat`)

## Coding Style & Naming Conventions
- Use ES modules (`import`/`export`) and keep semicolons enabled, matching current files.
- Preserve existing formatting per file: backend JS typically uses 2-space indentation; frontend JS/CSS uses 4 spaces.
- Prefer descriptive camelCase names for variables/functions (`gatewayWsUrl`, `loadServerConfig`).
- Keep frontend IDs/classes consistent with existing DOM naming (`authContainer`, `messagesWrapper`).
- No ESLint/Prettier config is committed; keep changes minimal and style-consistent.

## Testing Guidelines
- There is no automated test suite yet; use targeted manual smoke checks before opening a PR.
- When adding tests in future, place them under a dedicated `tests/` directory and name files by feature (example: `chat.proxy.test.js`).
- Verify both local and proxied WebSocket behavior, and include error-path checks for API endpoints.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(scope): ...`, `docs(scope): ...`, `fix(scope): ...`.
- Keep commits focused and atomic; avoid bundling unrelated UI/backend changes.
- PRs should include: purpose, key changes, validation steps, and screenshots/GIFs for UI updates.
- Link related issues/tasks and call out `.env` or deployment-impacting changes explicitly.

## Security & Configuration Tips
- Never commit real tokens or access keys; only update `.env.example` with placeholders.
- Treat `/api/execute` changes as high-risk: keep command allowlists strict and review input handling carefully.
