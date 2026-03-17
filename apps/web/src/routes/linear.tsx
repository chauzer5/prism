import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useMemo } from "react";
import {
  LayoutList,
  ArrowLeft,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

// ── Helpers ──

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

function getPriorityLabel(p: number): string {
  switch (p) {
    case 1: return "Urgent";
    case 2: return "High";
    case 3: return "Medium";
    case 4: return "Low";
    default: return "";
  }
}

function getPriorityColor(p: number): string {
  switch (p) {
    case 1: return "bg-[rgba(239,68,68,0.15)] text-red-400";
    case 2: return "bg-[rgba(249,115,22,0.15)] text-orange-400";
    case 3: return "bg-[rgba(234,179,8,0.15)] text-yellow-400";
    case 4: return "bg-[rgba(107,114,128,0.15)] text-text-muted";
    default: return "";
  }
}

function getStatusColor(statusType: string): string {
  switch (statusType) {
    case "started": return "bg-[rgba(59,130,246,0.15)] text-blue-400";
    case "unstarted": return "bg-[rgba(107,114,128,0.15)] text-text-muted";
    case "backlog": return "bg-[rgba(107,114,128,0.1)] text-text-muted";
    case "completed": return "bg-[rgba(34,197,94,0.15)] text-neon-green";
    default: return "bg-[rgba(107,114,128,0.1)] text-text-muted";
  }
}

const MAX_DEPLOYED = 3;

function capDeployed<T extends { status: string }>(issues: T[]): T[] {
  const nonDeployed = issues.filter((i) => i.status !== "Deployed");
  const deployed = issues.filter((i) => i.status === "Deployed").slice(0, MAX_DEPLOYED);
  return [...nonDeployed, ...deployed];
}

// ── Types ──

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  status_type: string;
  priority: number;
  assignee: string | null;
  assignee_is_me: boolean;
  assignee_is_team: boolean;
  team_key: string;
  team_name: string;
  labels: string[];
  url: string;
  updated_at: string;
  created_at: string;
}

// ── Issue Card ──

function IssueCard({ issue, onOpen }: { issue: LinearIssue; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(issue.identifier)}
      className="w-full text-left rounded-lg border border-border bg-[rgba(255,45,123,0.02)] px-3.5 py-3 transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.04)]"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-neon-pink">{issue.identifier}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", getStatusColor(issue.status_type))}>
          {issue.status}
        </span>
      </div>
      <div className="mt-1 text-xs font-medium text-cream">{issue.title}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
        {issue.priority > 0 && (
          <>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", getPriorityColor(issue.priority))}>
              {getPriorityLabel(issue.priority)}
            </span>
            <span>·</span>
          </>
        )}
        <span>{issue.assignee ?? "Unassigned"}</span>
        <span>·</span>
        <span>{issue.team_key}</span>
        <span>·</span>
        <span>{timeAgo(issue.updated_at)}</span>
      </div>
      {issue.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {issue.labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-[rgba(139,92,246,0.12)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-purple"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Issue Detail View ──

function IssueDetailView({
  identifier,
  onBack,
}: {
  identifier: string;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.linear.issueDetail.useQuery(
    { identifier },
  );
  const [commentText, setCommentText] = useState("");
  const addComment = trpc.linear.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      refetch();
    },
  });

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:text-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="font-mono text-xs text-neon-pink">{identifier}</span>
        {detail && (
          <a
            href={detail.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink"
            title="Open in Linear"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
        </div>
      )}
      {isError && (
        <div className="p-4 text-xs text-red-400">Failed to load issue detail</div>
      )}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", getStatusColor(detail.status_type))}>
                {detail.status}
              </span>
              {detail.priority > 0 && (
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", getPriorityColor(detail.priority))}>
                  {getPriorityLabel(detail.priority)}
                </span>
              )}
              <span className="text-text-muted">{detail.assignee ?? "Unassigned"}</span>
              <span className="text-text-muted">{detail.team_key}</span>
            </div>
            {detail.labels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {detail.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-[rgba(139,92,246,0.12)] px-2 py-0.5 text-[9px] font-semibold text-neon-purple"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          {detail.description && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Description
              </h3>
              <div className="rounded-lg border border-border bg-[rgba(0,0,0,0.2)] p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
                {detail.description}
              </div>
            </section>
          )}

          {/* Comments */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Comments ({detail.comments.length})
            </h3>
            <div className="space-y-3">
              {detail.comments.map((comment, i) => (
                <div key={i} className="rounded-lg border border-border/50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="font-medium text-cream">{comment.author}</span>
                    <span className="text-text-muted">{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div className="mt-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y"
              />
              <button
                onClick={() =>
                  addComment.mutate({ issueId: detail.id, body: commentText })
                }
                disabled={addComment.isPending || !commentText.trim()}
                className="mt-2 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
              >
                {addComment.isPending ? "Posting..." : "Comment"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

type Tab = "mine" | "team" | "ready";

function LinearPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const { data: allIssues, isLoading, isError, refetch } = trpc.linear.issues.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );

  const { myIssues, teamIssues, readyIssues } = useMemo(() => {
    if (!allIssues) return { myIssues: [], teamIssues: [], readyIssues: [] };
    return {
      myIssues: capDeployed(allIssues.filter((i) => i.assignee_is_me)),
      teamIssues: capDeployed(allIssues.filter((i) => i.assignee_is_team)),
      readyIssues: allIssues.filter((i) => i.status === "Ready to Start"),
    };
  }, [allIssues]);

  const currentIssues =
    tab === "mine"
      ? myIssues
      : tab === "team"
        ? teamIssues
        : readyIssues;

  if (selectedIssue) {
    return (
      <div className="flex h-full flex-col">
        <IssueDetailView
          identifier={selectedIssue}
          onBack={() => setSelectedIssue(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Linear
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">Issues and tickets</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { key: "mine" as Tab, label: "Mine", count: myIssues.length },
          { key: "team" as Tab, label: "Team", count: teamIssues.length },
          { key: "ready" as Tab, label: "Ready", count: readyIssues.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-all",
              tab === t.key
                ? "border-neon-pink text-neon-pink"
                : "border-transparent text-text-muted hover:text-cream",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === t.key
                  ? "bg-[rgba(255,45,123,0.12)] text-neon-pink"
                  : "bg-[rgba(107,114,128,0.1)] text-text-muted",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center pt-16">
            <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <X className="h-8 w-8 text-red-400 opacity-50" />
            <p className="mt-2 text-xs text-text-muted">
              Could not reach Linear. Check your API key in Settings.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs text-neon-pink hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && currentIssues.length === 0 && (
          <div className="flex items-center justify-center pt-16">
            <div className="text-center">
              <LayoutList className="mx-auto h-10 w-10 text-text-muted opacity-30" />
              <p className="mt-3 text-sm text-text-muted">No tickets</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {currentIssues.map((issue, i) => (
            <div key={issue.id} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
              <IssueCard issue={issue} onOpen={setSelectedIssue} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const linearRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/linear",
  component: LinearPage,
});
