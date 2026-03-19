import { LayoutList, ExternalLink } from "lucide-react";
import { trpc } from "@/trpc";
import { PanelShell } from "@/components/layout/PanelShell";
import { cn } from "@/lib/utils";

function priorityColor(p: number): string {
  switch (p) {
    case 1: return "bg-[rgba(239,68,68,0.15)] text-red-400";
    case 2: return "bg-[rgba(249,115,22,0.15)] text-orange-400";
    case 3: return "bg-[rgba(234,179,8,0.15)] text-yellow-400";
    case 4: return "bg-[rgba(107,114,128,0.15)] text-text-muted";
    default: return "";
  }
}

function priorityLabel(p: number): string {
  switch (p) {
    case 1: return "Urgent";
    case 2: return "High";
    case 3: return "Medium";
    case 4: return "Low";
    default: return "";
  }
}

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

export function MyTicketsPanel() {
  const { data, isLoading, error } = trpc.linear.issues.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const inProgress = data?.filter((i) => i.assignee_is_me && i.status_type === "started" && i.status !== "Deployed") ?? [];

  return (
    <PanelShell
      title="In Progress"
      icon={<LayoutList className="h-4 w-4" />}
      badge={inProgress.length > 0 ? String(inProgress.length) : undefined}
      loading={isLoading}
      error={error?.message}
      className="col-span-full md:col-span-1 xl:col-span-2 self-start"
    >
      {inProgress.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-xs text-text-muted">No in-progress tickets</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {inProgress.map((issue) => (
            <a
              key={issue.id}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-all hover:bg-[rgba(255,45,123,0.04)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-neon-pink">{issue.identifier}</span>
                  <span className="rounded-full bg-[rgba(59,130,246,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">
                    {issue.status}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-cream">{issue.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-text-muted">
                  {issue.priority > 0 && (
                    <>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", priorityColor(issue.priority))}>
                        {priorityLabel(issue.priority)}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  <span>{issue.team_key}</span>
                  <span>·</span>
                  <span>{timeAgo(issue.updated_at)}</span>
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
