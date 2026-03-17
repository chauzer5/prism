# PRISM Roadmap

## Agents
- **Agent notifications** — Agents notify the dashboard when they complete work or need feedback
- **Suggested bots** — Recommend bots that can help with specific todo tasks
- 🐛 **Terminal history lost on navigation** — When navigating away from the agent page and returning, the terminal history is gone and the user sees a blank empty terminal. The PTY output should be preserved/restored so the full session history is visible when switching back.

## Slack
- **DM & mention monitoring** — Surface @mentions and DM content that need review/response (unread count is done, content surfacing remains)

## Todos
- **Richer todo page** — More context per todo (source thread, assignees, due dates, priority reasoning)
- **Completion history** — Charts showing historical completed todo trends over time

## Done
- ~~Channel context~~ — Inline edit on channel detail + add form
- ~~Unread DM count~~ — 2-min poller, Quick Stats dashboard card
- ~~Model selection~~ — Select which model an agent uses when spawning
- ~~PI team selection~~ — Select a PI team when spawning an agent task
- ~~Linear integration~~ — Pull issues from Linear with mine/team/ready tabs
- ~~GitLab integration~~ — View MRs with approval tracking, pipeline jobs, discussions, merge
