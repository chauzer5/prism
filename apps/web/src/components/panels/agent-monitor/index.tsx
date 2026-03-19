import { useNavigate } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

const ACTIVITY_CONFIG = {
  not_running: {
    label: "Not running",
    dotClass: "bg-text-muted/40",
    textClass: "text-text-muted",
    link: "Start agent →",
  },
  busy: {
    label: "Working",
    dotClass: "bg-neon-yellow shadow-[0_0_8px_rgba(250,204,21,0.5)] animate-pulse",
    textClass: "text-neon-yellow",
    link: "View terminal →",
  },
  idle: {
    label: "Waiting for input",
    dotClass: "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]",
    textClass: "text-neon-green",
    link: "Open terminal →",
  },
} as const;

export function AgentMonitorPanel() {
  const navigate = useNavigate();

  const status = trpc.agents.status.useQuery(undefined, {
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const activity = status.data?.activity ?? "not_running";
  const config = ACTIVITY_CONFIG[activity];

  return (
    <PanelShell
      title="Claude Agent"
      icon={<Bot className="h-4 w-4" />}
      badge={config.label}
      loading={status.isLoading}
      error={status.error?.message}
      className="col-span-full self-start"
    >
      <div className="flex items-center justify-between rounded-lg bg-[rgba(0,0,0,0.2)] p-3 font-mono text-[11.5px] leading-relaxed">
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", config.dotClass)} />
          <span className={config.textClass}>{config.label}</span>
        </div>
        <button
          onClick={() => navigate({ to: "/agents" })}
          className="shrink-0 text-neon-pink hover:underline text-[11px]"
        >
          {config.link}
        </button>
      </div>
    </PanelShell>
  );
}
