# Chatrix — Frontend

The web client for **Chatrix**, a real-time chat application built with React, TypeScript, and Tailwind CSS. This repository contains **frontend code only** — the backend (REST + Socket.IO API) lives in a separate repository and is consumed over HTTP at `http://localhost:5000`.

> **API contract:** [`API_EXAMPLES.md`](./API_EXAMPLES.md) is the canonical reference for every endpoint, payload, and socket event this client must honor. [`requests.http`](./requests.http) contains runnable REST examples.

## Features

**Auth & account**
- Register, login, and email-verification flows (with an optional verification gate)
- Session handled via httpOnly cookies (`access_token` / `refresh_token`) — no tokens in `localStorage`
- Protected routes (`/chat`, `/settings`) behind an auth guard, with redirect back to the requested page

**Conversations**
- Direct (1:1) and group conversations, deduped on creation
- Conversation list with live updates, local unread badges, and unread reset on open
- New-conversation dialog with user search, member management, and invitations
- Group ownership: the owner may rename the group, change its icon, invite people, and remove (kick) members
- In-conversation message search and a shared-media panel with a full-screen lightbox

**Messaging**
- Real-time delivery over Socket.IO (`message:new`, `message:status`, `message:read`, typing, presence)
- Keyset pagination (`cursor` + `limit`) for fast, gap-free history loading
- Replies, message forwarding, per-message info (delivery/read receipts)
- Composers with emoji picker, voice notes, and drag/paste file attachments
- Uploads go **directly to R2** via presigned URLs (sign → PUT → confirm); no multipart endpoint
- Optimistic, monotonic message status: `sent` → `delivered` → `read`

**Settings & UX**
- Settings page (email notifications, read receipts) with optimistic updates
- Light/dark/system theme with a persistent toggle
- Accessible dialogs, keyboard support (Esc to close, focus rings), responsive two-pane layout

**Mock mode**
- `VITE_USE_MOCK=true` swaps the REST and Socket.IO clients for an in-browser simulation seeded with demo data, so the whole UI can be exercised **without a backend**

## Tech stack

| Area | Choice |
| --- | --- |
| Build | [Vite](https://vite.dev) + `@vitejs/plugin-react` |
| UI | React 19, TypeScript, React Router 7 |
| Styling | Tailwind CSS v4, `tw-animate-css`, shadcn/ui-style components (Base UI) |
| State/data | React Context (auth, socket, presence), Zustand, Axios |
| Realtime | `socket.io-client` |
| Icons | `lucide-react` |
| Linting | Oxlint |

## Getting started

### Prerequisites
- Node.js 20+ and npm
- (Optional) the Chatrix backend running at `http://localhost:5000` — skip it by using mock mode

### 1. Install

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env.development
```

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_USE_MOCK` | `false` | Use in-browser mock data instead of the real REST + Socket.IO API. |
| `VITE_API_ORIGIN` | `http://localhost:5000` | Backend origin for REST, Socket.IO, and `/uploads` media. |
| `VITE_MOCK_AUTO_REPLY` | `true` | Mock mode only: simulate replies from other participants. |
| `VITE_MOCK_EMAIL_VERIFICATION` | `false` | Mock mode only: simulate mandatory email verification. |

### 3. Run

```bash
npm run dev        # start the dev server (Vite)
```

Or explore the UI with no backend at all:

```bash
# .env.development → VITE_USE_MOCK=true
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |

## Project structure

```
src/
├── components/
│   ├── chat/          # Conversation list, room, composer, panels & dialogs
│   └── ui/            # Primitive UI pieces (button, dialog, input, switch…)
├── contexts/          # auth, socket, presence providers
├── hooks/             # Shared hooks (e.g. user search)
├── lib/               # API client, uploads, pagination helpers, mock backend
├── pages/             # Route-level screens (login, register, chat, settings)
├── types/             # Types mirrored from the API contract
└── App.tsx            # Providers + route table
```

Key routes: `/login`, `/register`, `/verify-email`, `/chat`, `/chat/:conversationId`, `/settings`.

## Architecture notes

These rules come from the API contract in `AGENTS.md` / `API_EXAMPLES.md` and must stay in sync with the backend:

- **Auth** is cookie-based. Every authenticated request is sent with `credentials: 'include'`.
- **Realtime** targets `user:<id>` rooms, not conversation rooms. The sender is excluded from events they trigger, except via ack.
- **Group management** (rename / icon / invite / kick) is REST-only; results reach clients through `conversation:updated` (members), `conversation:new` (invitees) and `conversation:removed` (a member the owner removed — the client drops the chat).
- **Pagination** is keyset-based: `?cursor=<base64url>&limit=30`, returning `nextCursor` + `hasMore`.
- **Uploads** are direct-to-R2: `POST /uploads/sign` → `PUT` the bytes to the presigned URL → `POST /uploads/:uploadId/confirm`. There is no multipart endpoint.
- **Unread counts** are only returned by `GET /conversations`; the client maintains badges locally from `message:new` / `message:read`.
- **Receipts** respect `settings.readReceipts`; typing, status, and presence are never persisted.
- **Types** in `src/types/` mirror the documented API shapes — don't invent fields.

## Documentation

| File | Contents |
| --- | --- |
| [`API_EXAMPLES.md`](./API_EXAMPLES.md) | Full REST + Socket.IO contract (source of truth) |
| [`requests.http`](./requests.http) | Executable REST examples with cookies |
| [`AGENTS.md`](./AGENTS.md) | Repo purpose and working rules for contributors/agents |
