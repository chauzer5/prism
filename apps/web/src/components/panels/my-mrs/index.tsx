import { useNavigate } from "@tanstack/react-router";
import { GitMerge, ExternalLink } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn, timeAgo } from "@/lib/utils";

function pipelineDotClass(status: string | null): string {
  switch (status) {
    case "success": return "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]";
    case "failed": case "failure": return "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
    case "running": case "pending": return "bg-neon-yellow shadow-[0_0_8px_rgba(250,204,21,0.5)]";
    case "manual": case "created": case "waiting_for_resource": case "scheduled": return "bg-neon-purple shadow-[0_0_8px_rgba(168,85,247,0.5)]";
    default: return "bg-text-muted/40";
  }
}

function pipelineTextClass(status: string | null): string {
  switch (status) {
    case "success": return "text-neon-green";
    case "failed": case "failure": return "text-red-400";
    case "running": case "pending": return "text-neon-yellow";
    case "manual": case "created": case "waiting_for_resource": case "scheduled": return "text-neon-purple";
    default: return "text-text-muted";
  }
}

export function MyMRsPanel() {
  const navigate = useNavigate();
  const { data, isLoading, error } = trpc.sourceControl.pullRequests.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const myMRs = data?.filter((pr) => pr.is_mine) ?? [];

  return (
    <PanelShell
      title="My MRs"
      icon={<GitMerge className="h-4 w-4" />}
      badge={myMRs.length > 0 ? String(myMRs.length) : undefined}
      loading={isLoading}
      error={error?.message}
      className="col-span-full md:col-span-1 xl:col-span-2 self-start"
    >
      {myMRs.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-xs text-text-muted">No open MRs</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {myMRs.map((mr) => (
            <a
              key={mr.id}
              href={mr.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-all hover:bg-[rgba(255,45,123,0.04)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-neon-pink">
                    {mr.provider === "gitlab" ? "!" : "#"}{mr.number}
                  </span>
                  {mr.draft && (
                    <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
                      Draft
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-cream">{mr.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                  <div className="flex items-center gap-1">
                    <span className={cn("font-medium", pipelineTextClass(mr.check_status))}>Pipeline</span>
                    <div className={cn("h-2 w-2 rounded-full", pipelineDotClass(mr.check_status))} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn("font-medium", mr.approved ? "text-neon-green" : "text-text-muted")}>Approval</span>
                    <div className={cn("h-2 w-2 rounded-full", mr.approved ? "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]" : "bg-text-muted/40")} />
                  </div>
                  <span>·</span>
                  <span>{timeAgo(mr.updated_at)}</span>
                </div>
              </div>
              <ExternalLink className="h-3 w-3 shrink-0 text-text-muted" />
            </a>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
