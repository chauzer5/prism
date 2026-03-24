import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { AgentControl } from "@/components/AgentControl";

function AgentsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Agent
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Launch and manage Claude Code in Terminal.app
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <AgentControl />
      </div>
    </div>
  );
}

export const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});
