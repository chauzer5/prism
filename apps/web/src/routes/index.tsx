import { useState, useCallback } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { PanelGrid } from "@/components/layout/PanelGrid";
import { QuickStatsPanel } from "@/components/panels/placeholder";
import { AgentMonitorPanel } from "@/components/panels/agent-monitor";
import { SlackSummaryPanel } from "@/components/panels/slack-summary";
import { MyMRsPanel } from "@/components/panels/my-mrs";
import { MyTicketsPanel } from "@/components/panels/my-tickets";
import { TodoPanel } from "@/components/panels/todos";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { useSourceControlEnabled } from "@/hooks/useSourceControlEnabled";
import { useLinearEnabled } from "@/hooks/useLinearEnabled";
import { useTodosEnabled } from "@/hooks/useTodosEnabled";
import { useAgentsEnabled } from "@/hooks/useAgentsEnabled";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { RefreshCw, CheckCircle, Loader2 } from "lucide-react";

function Dashboard() {
  useWebSocket();
  const { enabled: slackEnabled } = useSlackEnabled();
  const { enabled: scEnabled } = useSourceControlEnabled();
  const { enabled: linearEnabled } = useLinearEnabled();
  const { enabled: todosEnabled } = useTodosEnabled();
  const { enabled: agentsEnabled } = useAgentsEnabled();
  const ping = trpc.health.ping.useQuery(undefined, {
    refetchInterval: (query) => (query.state.data ? 30_000 : 2_000),
    retry: 3,
  });
  const serverUp = !!ping.data;
  const utils = trpc.useUtils();
  const [syncing, setSyncing] = useState(false);

  const handleSyncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await utils.invalidate();
    } finally {
      setSyncing(false);
    }
  }, [utils]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {today} — All systems operational
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <CheckCircle className="h-4.5 w-4.5 text-neon-green" />
            <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-1.5 text-[11px] text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Server connected
            </div>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]",
              syncing && "pointer-events-none opacity-60"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync All"}
          </button>
        </div>
      </div>

      {/* Two-zone layout: main grid + pinned todo column */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <PanelGrid>
            <QuickStatsPanel />
            {agentsEnabled && <AgentMonitorPanel />}
            {slackEnabled && <SlackSummaryPanel />}
            {scEnabled && <MyMRsPanel />}
            {linearEnabled && <MyTicketsPanel />}
          </PanelGrid>
        </div>

        {/* Pinned Todos column */}
        {todosEnabled && (
          <div className="flex w-80 shrink-0 flex-col border-l border-border xl:w-[340px]">
            <TodoPanel />
          </div>
        )}
      </div>
    </div>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
