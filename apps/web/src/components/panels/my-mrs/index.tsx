import { useNavigate } from "@tanstack/react-router";
import { GitMerge, ExternalLink } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusColor(status: string | null): string {
  switch (status) {
    case "success": return "text-neon-green";
    case "failed": return "text-red-400";
    case "running": case "pending": return "text-neon-yellow";
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
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className={cn("font-semibold", statusColor(mr.check_status))}>
                    {mr.check_status ?? "—"}
                  </span>
                  <span>·</span>
                  <span>{mr.approved ? "Approved" : "Pending review"}</span>
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
