# PRISM — Design Document

## Overview

PRISM is a local-only personal work dashboard that aggregates Slack summaries, todos from multiple sources, AI agent monitoring, GitLab merge requests, and Linear issues into a single webapp. It runs entirely on localhost — no cloud services, no accounts, no data leaves your machine.

## Architecture

```
Browser (React)
  ├── tRPC Client ──HTTP──► Hono Server ──► SQLite (Drizzle)
  └── WebSocket ───WS────► Hono WS Handler
                              ├── Agent Manager (node-pty child processes)
                              ├── Slack Poller (5-min cycle)
                              ├── DM Poller (2-min cycle)
                              └── Summarizer (Pi CLI)
```

### Frontend
- **Vite + React 19 + TypeScript** — fast dev, modern React features
- **shadcn/ui + Tailwind CSS v4** — dark-first cyberpunk design system
- **TanStack Router** — type-safe routing (manual route tree, no codegen)
- **TanStack React Query** via tRPC — server state with caching
- **Zustand** — lightweight client state (agent output buffers, sidebar)

### Backend
- **Hono** — lightweight, TS-first HTTP framework
- **tRPC v11** — end-to-end type safety, no API schema drift
- **Drizzle ORM + better-sqlite3** — zero-config local database with WAL mode
- **node-pty** — terminal emulation for interactive agent sessions
- **WebSockets** — real-time agent stdout/stderr streaming, status updates

### Shared
- `@prism/shared` — type definitions shared between client and server
- Panel, Todo, Agent, Team, Workflow, Integration types
- WebSocket event/command type definitions

## Key Design Decisions

### Local-Only
No authentication, no cloud sync, no remote APIs (except Slack's, via desktop credentials). The app is a personal tool that runs on your machine. This simplifies everything: no auth middleware, no deployment, no user management.

### Desktop Auth for Slack
Instead of requiring an OAuth app installation (which needs Slack admin approval), PRISM extracts credentials directly from the Slack desktop app on macOS. This means zero Slack setup — if you're logged into Slack desktop, PRISM can read your channels. See `docs/slack-desktop-auth.md`.

### PTY-Based Agents
Agents run in real PTY terminals via node-pty rather than capturing plain stdout. This preserves ANSI formatting, enables interactive input, and lets the frontend render a full terminal experience with XTerm.js.

### Conversation-Based Summaries
Rather than summarizing raw message dumps, the Slack poller groups messages into conversations (threads) and summarizes each independently. This produces more coherent summaries and enables per-conversation browsing.

## Integration Pattern

Each integration lives in `apps/server/src/integrations/<name>/` and implements:

```typescript
interface IntegrationProvider {
  id: string;
  name: string;
  type: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  sync(): Promise<void>;
  destroy(): Promise<void>;
}
```

Integrations are registered in `registry.ts` and discovered at startup. Each can expose a tRPC sub-router for custom API endpoints.

## Panel Pattern

Each panel is a self-contained directory under `apps/web/src/components/panels/<name>/`:

```
panels/
  placeholder/    # QuickStats — health, counts, metrics
    index.tsx
  slack/          # Slack headlines grid
    index.tsx
  agents/         # Running agent cards
    index.tsx
```

Panels render inside `PanelShell` which provides:
- Title bar with optional badge
- Loading state
- Error display
- Consistent glass-morphism card styling

## Data Flow

```
Slack Summarization:
  5-min timer → fetch messages → group into conversations → summarize via Pi CLI
  → store in SQLite → broadcast WS event → frontend invalidates query cache

Agent Execution:
  User spawns agent → server creates PTY process → stdout/stderr piped to WS
  → frontend renders in XTerm terminal → user can send stdin back through WS

Todo Management:
  CRUD via tRPC → SQLite → WS broadcast (optional) → frontend cache invalidation
```

## Database

SQLite via better-sqlite3 with WAL mode for concurrent reads. Schema managed via raw SQL migrations that run on server startup.

### Tables
- `todos` — aggregated todos with three-state workflow
- `slack_channels` — monitored channels with focus/ignore/context config
- `slack_summaries` — legacy per-poll summaries
- `slack_conversations` — thread-based conversation summaries
- `slack_day_headlines` — daily channel headlines
- `slack_channel_directory` — cached Slack channel list (24h TTL)
- `slack_user_directory` — cached Slack user directory
- `settings` — key-value configuration store
