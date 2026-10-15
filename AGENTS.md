# AGENTS.md

## Repo purpose
This is the **frontend only** for **Chatrix** (MERN chat app). The backend lives in a separate repository. Do **not** create backend code here (routes, models, controllers, middleware, server). Build the UI against the API contract documented below.

## API contract (source of truth)
- `API_EXAMPLES.md` — Complete REST + Socket.IO contract (auth, users, conversations, messages, socket events, keyset pagination, error shape). Treat this as the canonical reference.
- `requests.http` — Executable REST examples with cookies (useful for quick verification).
- Base URL: `http://localhost:5000/api/v1`
- Auth: httpOnly cookies (`access_token`, `refresh_token`). All auth-required requests must be sent with credentials (cookies). Error shape: `{ "message": "..." }` (validation errors also include `issues: [{ path, message }]`).
- Socket.IO: `http://localhost:5000`, authenticated via the `access_token` httpOnly cookie. Events and payload shapes are defined in `API_EXAMPLES.md`. Sender is excluded from events they trigger except via ack.
- Key details to match exactly:
  - Messages use **keyset pagination**: `?cursor=<base64url>&limit=30` (cursor from `_id`, next page fetches messages `< cursor`). `nextCursor` + `hasMore` in response.
  - Creating a direct conversation returns **200** if it already exists (deduped), **201** if newly created.
  - Avatar upload uses `multipart/form-data` with field `avatar` (JPEG/PNG/WebP/GIF, ≤5MB).
  - Socket targets **`user:<id>` rooms** (not conversation rooms). 
  - `message:send` is available via both REST and Socket.IO and both broadcast `message:new` to others.
  - Read receipts respect `settings.readReceipts`. Typing/status/presence are **not persisted**.

## UI/UX guidance
- `.opecode/skills/taste-skill/SKILL.md` defines `design-taste-frontend` (anti-slop frontend). It's tuned for landing/portfolio pages, not dashboards/chat apps — **adapt, don't copy** hero/landing patterns.
- Focus on quality bar that applies to product UI: state consistency, accessible contrast, loading/empty/error states, reduced motion where motion exists, theme consistency, and tight layout discipline. Follow its guardrails where they fit chat UX.
- The skill file is the most detailed UI instruction present. Read it before making broad visual/layout decisions for this frontend.

## Working rules
- **Frontend-only.** Keep all work in this directory. Don't add backend files or cross-reference backend repo internals.
- **Keep types aligned to the API.** Mirror shapes from `API_EXAMPLES.md` (users, conversations, participants, messages, settings). Don't invent fields.
- **Respect auth model.** Assume httpOnly cookie auth; never store access tokens in localStorage. Ensure requests include credentials.
- **Match event semantics.** When implementing Socket.IO, use the exact event names and payloads from the contract. Don't assume conversation-room broadcasts.
- **Before adding deps/config.** There may be no `package.json`, build config, or tooling yet. Inspect the current tree (including hidden) before scaffolding or installing. Don't assume Vite/Next/TS exist.
- **Trust executable sources.** If anything conflicts, prefer `API_EXAMPLES.md` and `requests.http` over assumptions.