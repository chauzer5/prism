# PRISM — Personal AI Work Dashboard

## Quick Start
```bash
npm install && npm run dev
```
Server: http://localhost:9001 | Web: http://localhost:5173

## Project Structure
- `packages/shared` — Shared types (`@prism/shared`)
- `apps/server` — Hono + tRPC + Drizzle backend
- `apps/web` — Vite + React + shadcn/ui frontend

## Conventions
- TypeScript strict mode everywhere
- tRPC for all client-server communication (no raw fetch)
- Drizzle ORM for all database access
- shadcn/ui components in `apps/web/src/components/ui/`
- Each panel is a self-contained directory under `components/panels/`
- Each integration is a self-contained directory under `integrations/`
- WebSocket for real-time events (agent stdout, notifications)
- Zustand for client-only state (layout, preferences)

## Database
- SQLite via better-sqlite3 (file: `data/prism.db`)
- Schema in `apps/server/src/db/schema.ts`
- Auto-migrate on server startup (raw SQL in `apps/server/src/db/index.ts`)

---

## Feature Inventory

### 1. Todos

**Files:** `apps/server/src/todos/router.ts`, `apps/server/src/todos/aggregator.ts`
**Frontend:** `apps/web/src/routes/todos.tsx`, `apps/web/src/components/panels/placeholder/index.tsx` (QuickStats card)

**What it does:** Three-state todo system (active → completed/dismissed) with priority levels (high/medium/low), due dates, source tracking, and URLs.

**tRPC endpoints (`todos.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `list` | query | Active todos only (for dashboard) |
| `listAll` | query | All todos grouped by status tab, sorted by priority then date |
| `create` | mutation | New todo with title, source, priority, dueDate, url |
| `update` | mutation | Edit title, description, priority |
| `setStatus` | mutation | Move between active/completed/dismissed |
| `toggle` | mutation | Legacy: flip between active ↔ completed |

**DB table:** `todos` — id, source, title, description, status, priority, dueDate, url, timestamps

---

### 2. Slack Integration

**Files:**
- `apps/server/src/slack/client.ts` — WebClient wrapper with desktop auth
- `apps/server/src/slack/desktop-auth.ts` — macOS Keychain credential extraction
- `apps/server/src/slack/poller.ts` — 5-minute channel polling loop
- `apps/server/src/slack/dm-poller.ts` — 2-minute unread DM polling
- `apps/server/src/slack/summarizer.ts` — Pi CLI conversation summarization
- `apps/server/src/slack/backfill-team-ids.ts` — Fix deep links with team IDs
- `apps/server/src/slack/router.ts` — tRPC endpoints

**Frontend:** `apps/web/src/routes/slack.tsx`, `apps/web/src/components/panels/slack/index.tsx`

**What it does:** Monitors Slack channels using desktop auth (no OAuth). Polls channels, groups messages into threads/conversations, summarizes each with AI, generates daily headlines. Tracks unread DMs.

**Authentication:** Extracts credentials from the Slack desktop app:
1. `xoxc-` token from LevelDB (Electron localStorage)
2. `xoxd-` cookie from Chromium Cookies DB, decrypted via macOS Keychain
Both are required for every API call. See `docs/slack-desktop-auth.md` for details.

**Data flow:**
1. Poller runs every 5 min → fetches messages from enabled channels
2. Groups messages into conversations (thread hierarchy)
3. Summarizes each conversation via Pi CLI
4. Generates daily headlines from conversation summaries
5. Broadcasts `slack:summary` event to all WebSocket clients

**tRPC endpoints (`slack.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `auth.status` | query | Auth mode (desktop/bot-token/none) + workspaces |
| `auth.refresh` | mutation | Clear cache, re-fetch credentials |
| `channels.list` | query | All monitored channels, sorted by sortOrder |
| `channels.add` | mutation | Add channel with focus/ignore/context/todo config |
| `channels.update` | mutation | Edit channel focus, ignore, enabled, todo settings |
| `channels.remove` | mutation | Stop monitoring a channel |
| `channels.reorder` | mutation | Persist drag-and-drop sort order |
| `conversations.byDay` | query | Days with headlines + conversations for a channel |
| `conversations.latest` | query | Latest headline per enabled channel (dashboard) |
| `summaries.list` | query | Legacy: raw summaries for a channel |
| `summaries.latest` | query | Legacy: latest summary per channel |
| `unreadDms` | query | Unread DM count + last-checked timestamp |
| `pollNow` | mutation | Trigger immediate poll of all channels |
| `pollChannel` | mutation | Trigger immediate poll of one channel |

**Per-channel config fields:**
- `focus` — LLM instructions for what to summarize
- `ignore` — Patterns to filter out
- `context` — Background info for summarizer
- `todosEnabled` — Extract todos from this channel
- `todoFocus` — Todo extraction instructions
- `teamId` — Slack workspace team ID (for multi-workspace + deep links)

**DB tables:** `slack_channels`, `slack_summaries`, `slack_conversations`, `slack_day_headlines`, `slack_channel_directory`, `slack_user_directory`

---

### 3. Agent System

**Files:**
- `apps/server/src/agents/manager.ts` — Agent lifecycle, process spawning, PTY management
- `apps/server/src/agents/router.ts` — tRPC endpoints
- `apps/server/src/agents/teams.ts` — Team YAML parsing (`~/.pi/agent/teams.yaml`)
- `apps/server/src/agents/teams-router.ts` — Team CRUD endpoints
- `apps/server/src/agents/workflows.ts` — Workflow YAML parsing (`~/.pi/agent/agent-workflow.yaml`)
- `apps/server/src/agents/workflows-router.ts` — Workflow CRUD endpoints
- `apps/server/src/agents/sessions.ts` — Parse Pi CLI session JSONL files
- `apps/server/src/agents/extensions.ts` — Pi extensions configuration

**Frontend:** `apps/web/src/routes/agents.tsx`, `apps/web/src/routes/teams.tsx`, `apps/web/src/routes/workflows.tsx`, `apps/web/src/components/panels/agents/index.tsx`, `apps/web/src/components/XTerm.tsx`

**What it does:** Spawn and manage AI agents via Pi CLI. Supports interactive PTY terminals with real-time output streaming over WebSocket. Agents can be organized into teams with model/thinking overrides and chained into multi-step workflows.

**Agent modes:**
- **PTY mode** — Interactive terminal emulation via node-pty, real-time stdout/stderr
- **Structured mode** — JSON output from Pi CLI, multi-turn with session persistence

**tRPC endpoints (`agents.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `list` | query | All agents with status |
| `get` | query | Single agent by ID |
| `getOutput` | query | Full output history for an agent |
| `create` | mutation | Create structured-mode agent |
| `spawn` | mutation | Create PTY agent with prompt, team, workflow, model |
| `createPty` | mutation | Direct PTY creation with raw command + args |
| `stop` | mutation | Terminate agent process |
| `remove` | mutation | Delete agent record (must be stopped first) |
| `rename` | mutation | Change agent display name |
| `listModels` | query | Available models from `pi --list-models` (cached 60s) |
| `listTeams` | query | Teams from `~/.pi/agent/teams.yaml` |
| `listSessions` | query | Historical Pi sessions (JSONL files) |
| `resumeSession` | mutation | Resume a saved session in a new PTY |

**Sub-routers:**
- `agents.teams.*` — `list`, `agentDefs`, `saveTeams`
- `agents.workflows.*` — `list`, `agentDefs`, `save`

**Key details:**
- Session files stored at `~/.pi/agent/sessions/prism/`
- JSONL format with stdout/stderr/user input captured
- Max 500 output lines per agent (server-side buffer)
- Kill timeout: 5 seconds after stop signal
- Model list filters out dated pins and `-latest` aliases, groups by provider

---

### 4. GitLab Integration

**Files:**
- `apps/server/src/integrations/gitlab/client.ts` — GitLab REST API client
- `apps/server/src/integrations/gitlab/router.ts` — tRPC endpoints

**Frontend:** `apps/web/src/routes/gitlab.tsx`

**What it does:** Fetches open merge requests from a GitLab group, enriches with approval state, mention detection, and team membership. Provides MR detail views with pipeline jobs, discussions, and merge capability.

**tRPC endpoints (`gitlab.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `mergeRequests` | query | All enriched open MRs (polled every 60s) |
| `mrDetail` | query | Full MR detail with pipeline, approvals, discussions |
| `merge` | mutation | Merge an MR |
| `addNote` | mutation | Add a comment to an MR |
| `playJob` | mutation | Play a manual pipeline job |
| `retryJob` | mutation | Retry a failed pipeline job |
| `testConnection` | mutation | Validate PAT, return username |

**Settings keys:** `gitlab.pat`, `gitlab.groupId`

---

### 5. Linear Integration

**Files:**
- `apps/server/src/integrations/linear/client.ts` — Linear GraphQL client
- `apps/server/src/integrations/linear/router.ts` — tRPC endpoints

**Frontend:** `apps/web/src/routes/linear.tsx`

**What it does:** Fetches issues from Linear (viewer's assigned + team issues), deduplicates, and enriches with assignee flags. Provides issue detail views with comments.

**tRPC endpoints (`linear.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `issues` | query | All issues (polled every 60s) |
| `issueDetail` | query | Full issue detail with comments |
| `addComment` | mutation | Post a comment on an issue |
| `testConnection` | mutation | Validate API key, return name/email |

**Settings keys:** `linear.apiKey`, `linear.teamId`

---

### 6. Settings

**Files:** `apps/server/src/settings/router.ts`
**Frontend:** `apps/web/src/routes/settings.tsx`

**What it does:** Key-value settings store in SQLite.

**tRPC endpoints (`settings.*`):**
| Endpoint | Type | Description |
|----------|------|-------------|
| `get` | query | Fetch single setting by key |
| `getMany` | query | Fetch multiple settings by key array |
| `set` | mutation | Upsert a setting |

**Known keys:** `slack.summarizationModel`, `slack.enabled`, `gitlab.pat`, `gitlab.groupId`, `linear.apiKey`, `linear.teamId`

---

### 7. WebSocket System

**Files:** `apps/server/src/ws/index.ts`, `apps/server/src/ws/events.ts`, `packages/shared/src/events.ts`
**Frontend:** `apps/web/src/hooks/useWebSocket.ts`

**What it does:** Real-time bidirectional communication. Server broadcasts agent output and status events. Clients send agent input, stop commands, and terminal resize events.

**Events (server → client):**
- `agent:stdout`, `agent:stderr` — Real-time agent output
- `agent:status`, `agent:exit`, `agent:turn_end` — Agent lifecycle
- `agent:renamed` — Agent name changed
- `todo:updated` — Todo changed
- `slack:summary` — New Slack summary available
- `slack:unread` — Unread DM count updated
- `ping` — Keepalive

**Commands (client → server):**
- `agent:stdin` — Send input to agent PTY
- `agent:start`, `agent:stop` — Agent lifecycle control
- `agent:resize` — Terminal resize
- `subscribe`, `unsubscribe` — Channel subscriptions
- `pong` — Keepalive response

---

## Frontend Architecture

### Pages (TanStack Router)
| Route | File | Description |
|-------|------|-------------|
| `/` | `routes/index.tsx` | Dashboard: QuickStats + Slack headlines + agent monitor + todo sidebar |
| `/todos` | `routes/todos.tsx` | Full todo manager with tabs (active/completed/dismissed), filters, create form |
| `/agents` | `routes/agents.tsx` | Agent spawner + XTerm terminal + session history |
| `/teams` | `routes/teams.tsx` | Team management with member cards, model/thinking overrides |
| `/workflows` | `routes/workflows.tsx` | Workflow builder with step editor |
| `/slack` | `routes/slack.tsx` | Channel config + conversation browser by day |
| `/gitlab` | `routes/gitlab.tsx` | GitLab MRs with tabs, detail view, pipeline, merge |
| `/linear` | `routes/linear.tsx` | Linear issues with tabs, detail view, comments |
| `/settings` | `routes/settings.tsx` | API keys, Slack enable/disable, model selector |

### Dashboard Panels
| Panel | Directory | Description |
|-------|-----------|-------------|
| QuickStats | `components/panels/placeholder/` | 4 cards: todos count, unread DMs, running agents, server health |
| Slack Summary | `components/panels/slack/` | Latest headline per enabled channel, 2-column grid |
| Agent Monitor | `components/panels/agents/` | Running agents grid with status dots, PID, team |
| Todo Panel | pinned in `routes/index.tsx` | Active todos sidebar (w-80) with inline status toggle |

### State Management
- **Zustand stores:** `stores/agents.ts` (agent output history, max 1000 lines/agent), `stores/layout.ts` (sidebar state)
- **tRPC + React Query:** All server state with auto-caching and invalidation
- **WebSocket hook:** `hooks/useWebSocket.ts` — Singleton connection, auto-reconnect (3s), listener pattern

### UI Theme
- Cyberpunk aesthetic: neon-pink, neon-cyan, neon-green, neon-yellow
- CRT scanlines overlay, perspective grid floor, floating particles
- Glass morphism cards with blur and gradient borders
- Dark-first design

---

## Adding a Backend Integration

1. Create `apps/server/src/integrations/<name>/` with `index.ts`, `router.ts`, `client.ts`
2. Implement the `Integration` interface from `@prism/shared`
3. Merge sub-router into `apps/server/src/router.ts`

## Adding a Dashboard Panel

1. Create `apps/web/src/components/panels/<name>/` with component + data hook
2. Register in panel registry
3. Panel auto-wraps in `PanelShell` (title bar, loading, error boundary)

## Adding a tRPC Endpoint

1. Add procedure to the relevant router in `apps/server/src/<feature>/router.ts`
2. Types flow automatically to the frontend via `AppRouter` export
3. Use `publicProcedure` (no auth — local-only app)
4. For real-time updates, broadcast via `apps/server/src/ws/events.ts`

## Adding a Frontend Route

1. Create `apps/web/src/routes/<name>.tsx` with `createRoute` from TanStack Router
2. Add to route tree in `apps/web/src/routes/routeTree.gen.ts`
3. Add sidebar link in `apps/web/src/components/layout/Sidebar.tsx`
