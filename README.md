# PRISM

A local-first personal work dashboard you build around _your_ workflow — your Slack channels, your AI agents, your todos, your GitLab MRs, your Linear tickets — so you can stop context-switching between ten browser tabs and see everything from one screen.

## What It Does

- **Slack Monitoring** — Polls your Slack channels, summarizes conversations with AI, and generates daily headlines. Uses desktop auth (no OAuth app required).
- **GitLab Integration** — View merge requests (mine, team, needs approval, mentions), pipeline jobs, discussions, and merge directly from the dashboard.
- **Linear Integration** — View issues (mine, team, ready), issue details, and post comments.
- **Todo Management** — Three-state workflow (active/completed/dismissed) with priority, due dates, and source tracking. Todos can be extracted from Slack channels automatically.
- **Agent System** — Spawn and monitor AI agents (via Pi CLI) with interactive PTY terminals, team composition, and multi-step workflows. Real-time stdout/stderr streaming over WebSocket.
- **Dashboard** — Quick stats, Slack headlines, agent status, and todos at a glance.

## Quick Start

```bash
npm install
npm run dev
```

- **Backend**: http://localhost:9001
- **Frontend**: http://localhost:5173

### Prerequisites

- Node.js 20+
- Slack desktop app (for desktop auth — see `docs/slack-desktop-auth.md`)
- [Pi CLI](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (for agent features)

## Tech Stack

| Layer         | Stack                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| Frontend      | React 19, Vite, TanStack Router + React Query, Zustand, Tailwind v4, shadcn/ui |
| Backend       | Hono, tRPC v11, Drizzle ORM, better-sqlite3, node-pty                          |
| Shared        | TypeScript types package (`@prism/shared`)                                     |
| Communication | tRPC (HTTP) + WebSocket (real-time)                                            |

## Project Structure

```
apps/
  server/          # Hono + tRPC backend
    src/
      agents/      # Agent spawning, teams, workflows, sessions
      db/          # Drizzle schema + migrations
      integrations/
        gitlab/    # GitLab MR client + tRPC router
        linear/    # Linear issue client + tRPC router
      slack/       # Slack client, poller, summarizer, desktop auth
      settings/    # Key-value settings store
      todos/       # Todo CRUD + aggregation
      ws/          # WebSocket handler + event broadcasting
  web/             # React frontend
    src/
      components/
        layout/    # Sidebar, PanelGrid, PanelShell
        panels/    # Dashboard panels (QuickStats, Slack, Agents, Todos)
        ui/        # shadcn/ui primitives
      hooks/       # useWebSocket, useSlackEnabled
      routes/      # TanStack Router pages
      stores/      # Zustand stores (agents, layout)
packages/
  shared/          # Types, WebSocket event definitions
data/              # SQLite database (gitignored)
docs/              # Additional documentation
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** — Agent-friendly guide: feature inventory, endpoints, patterns, and how to extend the app
- **[DESIGN.md](./DESIGN.md)** — Architecture decisions and system design
- **[ROADMAP.md](./ROADMAP.md)** — Planned features and known issues

## License

Private project.
