import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";

// The actual terminal UI is rendered by PersistentTerminal in __root.tsx.
// This route component is empty — it just needs to exist so the router
// recognizes /agents and the root layout can detect we're on this page.
function AgentsPage() {
  return null;
}

export const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});
