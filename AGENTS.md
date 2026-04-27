# Repository Guidelines

## Project Structure & Module Organization
- Backend entrypoint: `server.js` (Express + WebSocket proxy).
- Frontend assets are served from `public/`:
  - `public/index.html` for UI layout
  - `public/js/chat.js` for chat interactions
  - `public/css/style.css` for styling
- Runtime/config files:
  - `.env` for local secrets (do not commit)
  - `.env.example` for template values
  - `server.log` for local logs
- Dependencies and scripts are in `package.json` and `package-lock.json`.

## Build, Test, and Development Commands
- `npm install` — install project dependencies.
- `npm start` — run the server in production-style mode (default `PORT=3332`).
- `npm run dev` — run `server.js` in watch mode for local development.
- No automated tests are currently configured; run manual smoke checks for:
  - `GET /api/verify`
  - `GET /api/config`
  - WebSocket path `/ws/chat`

## Coding Style & Naming Conventions
- Use ES modules (`import`/`export`) and keep semicolons.
- Indentation: backend JS uses 2 spaces; frontend JS/CSS uses 4 spaces.
- Prefer descriptive camelCase names, e.g. `gatewayWsUrl`, `loadServerConfig`.
- Keep DOM IDs/classes consistent with existing names such as `authContainer` and `messagesWrapper`.
- No ESLint/Prettier config is committed; match surrounding file style and keep diffs minimal.

## Testing Guidelines
- Current validation is manual. Focus on auth flow, config loading, and local/proxied WebSocket behavior.
- For future tests, use a dedicated `tests/` directory and feature-based names (e.g. `chat.proxy.test.js`).
- Include error-path checks for API endpoints and connection failures.

## Commit & Pull Request Guidelines
- Follow Conventional Commits, e.g. `feat(chat): add reconnect logic`, `fix(api): validate token`.
- Keep commits focused and atomic; avoid mixing unrelated backend/frontend changes.
- PRs should include purpose, key changes, validation steps, and screenshots/GIFs for UI updates.
- Link related tasks/issues and call out any `.env` or deployment-impacting changes.

## Security & Configuration Tips
- Never commit real keys or tokens; only commit placeholders in `.env.example`.
- Treat `/api/execute` changes as high-risk: keep command allowlists strict and validate all inputs.
