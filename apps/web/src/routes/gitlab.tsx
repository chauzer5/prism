import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useMemo } from "react";
import {
  GitMerge,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronRight,
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

function PipelineBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[10px] text-text-muted">no pipeline</span>;
  const color =
    status === "success"
      ? "text-neon-green"
      : status === "running" || status === "pending"
        ? "text-neon-yellow"
        : status === "failed"
          ? "text-red-400"
          : "text-text-muted";
  return <span className={cn("text-[10px] font-medium", color)}>{status}</span>;
}

// ── MR Card ──

interface EnrichedMR {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  draft: boolean;
  author: string;
  author_username: string;
  source_branch: string;
  web_url: string;
  updated_at: string;
  pipeline_status: string | null;
  has_conflicts: boolean;
  is_mine: boolean;
  is_team_member: boolean;
  needs_your_approval: boolean;
  approval_rules_needing_you: string[];
  you_are_mentioned: boolean;
}

function MRCard({
  mr,
  onSelect,
}: {
  mr: EnrichedMR;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border px-3.5 py-3 transition-all",
        mr.needs_your_approval
          ? "border-neon-pink/30 bg-[rgba(255,45,123,0.06)] hover:border-neon-pink/50"
          : "border-border bg-[rgba(255,45,123,0.02)] hover:border-border-hover hover:bg-[rgba(255,45,123,0.04)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-neon-pink">!{mr.iid}</span>
        <div className="flex items-center gap-1">
          {mr.draft && (
            <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
              draft
            </span>
          )}
          {mr.has_conflicts && (
            <span className="rounded-full bg-[rgba(239,68,68,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-red-400">
              conflicts
            </span>
          )}
          {mr.you_are_mentioned && (
            <span className="rounded-full bg-[rgba(255,45,123,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
              @you
            </span>
          )}
        </div>
      </div>
      <div className={cn("mt-1 text-xs font-medium text-cream", mr.draft && "opacity-60")}>
        {mr.title}
      </div>
      {mr.approval_rules_needing_you.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {mr.approval_rules_needing_you.map((rule) => (
            <span
              key={rule}
              className="rounded-full bg-[rgba(255,45,123,0.12)] px-2 py-0.5 text-[9px] font-semibold text-neon-pink"
            >
              {rule}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
        <span>{mr.author}</span>
        <span>·</span>
        <span className="font-mono truncate max-w-[120px]">{mr.source_branch}</span>
        <span>·</span>
        <PipelineBadge status={mr.pipeline_status} />
        <span>·</span>
        <span>{timeAgo(mr.updated_at)}</span>
      </div>
    </button>
  );
}

// ── MR Detail View ──

function MRDetailView({
  projectId,
  mrIid,
  onBack,
}: {
  projectId: number;
  mrIid: number;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.gitlab.mrDetail.useQuery(
    { projectId, mrIid },
  );
  const [commentText, setCommentText] = useState("");
  const addNote = trpc.gitlab.addNote.useMutation({ onSuccess: () => { setCommentText(""); refetch(); } });
  const merge = trpc.gitlab.merge.useMutation({ onSuccess: () => refetch() });
  const play = trpc.gitlab.playJob.useMutation({ onSuccess: () => refetch() });
  const retry = trpc.gitlab.retryJob.useMutation({ onSuccess: () => refetch() });
  const [expandedDiscussions, setExpandedDiscussions] = useState<Set<string>>(new Set());

  const toggleDiscussion = (id: string) => {
    setExpandedDiscussions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        <span className="font-mono text-xs text-neon-pink">!{mrIid}</span>
        {detail && (
          <a
            href={detail.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink"
            title="Open in GitLab"
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
        <div className="p-4 text-xs text-red-400">Failed to load MR detail</div>
      )}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                detail.state === "opened"
                  ? "bg-[rgba(34,197,94,0.15)] text-neon-green"
                  : "bg-[rgba(107,114,128,0.15)] text-text-muted",
              )}>
                {detail.state}
              </span>
              {detail.draft && (
                <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-2 py-0.5 font-semibold text-text-muted">
                  draft
                </span>
              )}
              <span className="text-text-muted">{detail.author}</span>
              <span className="font-mono text-text-muted">
                {detail.source_branch} → {detail.target_branch}
              </span>
              {detail.changes_count !== "0" && (
                <span className="text-text-muted">{detail.changes_count} changes</span>
              )}
            </div>
          </div>

          {/* Pipeline */}
          {detail.jobs.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Pipeline
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.jobs.map((job) => (
                  <div
                    key={job.id}
                    className={cn(
                      "group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]",
                      job.status === "success"
                        ? "border-neon-green/20 text-neon-green"
                        : job.status === "failed"
                          ? job.allow_failure
                            ? "border-neon-yellow/20 text-neon-yellow"
                            : "border-red-400/20 text-red-400"
                          : job.status === "running"
                            ? "border-neon-cyan/20 text-neon-cyan"
                            : job.status === "manual"
                              ? "border-neon-purple/20 text-neon-purple"
                              : "border-border text-text-muted",
                    )}
                  >
                    <span className="font-mono">{job.name}</span>
                    {job.status === "manual" && (
                      <button
                        onClick={() => play.mutate({ projectId, jobId: job.id })}
                        disabled={play.isPending}
                        className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neon-pink"
                        title="Play"
                      >
                        <Play className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {job.status === "failed" && (
                      <button
                        onClick={() => retry.mutate({ projectId, jobId: job.id })}
                        disabled={retry.isPending}
                        className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neon-pink"
                        title="Retry"
                      >
                        <RotateCw className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Approval Rules */}
          {detail.approval_rules.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Approvals
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.approval_rules
                  .filter((r) => r.rule_type !== "any_approver" && r.rule_type !== "report_approver")
                  .map((rule) => (
                    <span
                      key={rule.name}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        rule.approved
                          ? "bg-[rgba(34,197,94,0.12)] text-neon-green"
                          : "bg-[rgba(255,45,123,0.12)] text-neon-pink",
                      )}
                    >
                      {rule.approved ? <Check className="mr-1 inline h-2.5 w-2.5" /> : null}
                      {rule.name}
                      {rule.approved_by.length > 0 && (
                        <span className="ml-1 opacity-70">({rule.approved_by.join(", ")})</span>
                      )}
                    </span>
                  ))}
              </div>
            </section>
          )}

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

          {/* Discussions */}
          {detail.discussions.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Discussions ({detail.discussions.length})
              </h3>
              <div className="space-y-2">
                {detail.discussions.map((disc) => (
                  <div
                    key={disc.id}
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      disc.resolved ? "border-border/50 opacity-60" : "border-border",
                    )}
                  >
                    <button
                      onClick={() => toggleDiscussion(disc.id)}
                      className="flex w-full items-center gap-1.5 text-left"
                    >
                      {expandedDiscussions.has(disc.id) ? (
                        <ChevronDown className="h-3 w-3 text-text-muted" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-text-muted" />
                      )}
                      <span className="text-xs font-medium text-cream">
                        {disc.notes[0]?.author}
                      </span>
                      {disc.resolved && (
                        <Check className="h-3 w-3 text-neon-green" />
                      )}
                      <span className="ml-auto text-[10px] text-text-muted">
                        {disc.notes.length} {disc.notes.length === 1 ? "note" : "notes"}
                      </span>
                    </button>
                    {expandedDiscussions.has(disc.id) && (
                      <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                        {disc.notes.map((note) => (
                          <div key={note.id}>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="font-medium text-cream">{note.author}</span>
                              <span className="text-text-muted">{timeAgo(note.created_at)}</span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
                              {note.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Comment input */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Add Comment
            </h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() =>
                  addNote.mutate({ projectId, mrIid, body: commentText })
                }
                disabled={addNote.isPending || !commentText.trim()}
                className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
              >
                {addNote.isPending ? "Posting..." : "Comment"}
              </button>
              {detail.can_merge && (
                <button
                  onClick={() => merge.mutate({ projectId, mrIid })}
                  disabled={merge.isPending}
                  className="rounded-lg bg-[rgba(34,197,94,0.15)] px-3 py-1.5 text-xs font-medium text-neon-green transition-all hover:bg-[rgba(34,197,94,0.25)] disabled:opacity-50"
                >
                  {merge.isPending ? "Merging..." : "Merge"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

type Tab = "mine" | "team" | "approval" | "mentions";

function GitLabPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedMR, setSelectedMR] = useState<{ projectId: number; iid: number } | null>(null);
  const { data: allMRs, isLoading, isError, refetch } = trpc.gitlab.mergeRequests.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );

  const { myMRs, teamMRs, approvalMRs, mentionMRs } = useMemo(() => {
    if (!allMRs) return { myMRs: [], teamMRs: [], approvalMRs: [], mentionMRs: [] };
    return {
      myMRs: allMRs.filter((mr) => mr.is_mine),
      teamMRs: allMRs.filter((mr) => mr.is_team_member),
      approvalMRs: allMRs.filter((mr) => mr.needs_your_approval),
      mentionMRs: allMRs.filter((mr) => mr.you_are_mentioned),
    };
  }, [allMRs]);

  const currentMRs =
    tab === "mine"
      ? myMRs
      : tab === "team"
        ? teamMRs
        : tab === "approval"
          ? approvalMRs
          : mentionMRs;

  if (selectedMR) {
    return (
      <div className="flex h-full flex-col">
        <MRDetailView
          projectId={selectedMR.projectId}
          mrIid={selectedMR.iid}
          onBack={() => setSelectedMR(null)}
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
            GitLab
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">Merge requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { key: "mine" as Tab, label: "Mine", count: myMRs.length },
          { key: "team" as Tab, label: "Team", count: teamMRs.length },
          { key: "approval" as Tab, label: "Needs You", count: approvalMRs.length },
          { key: "mentions" as Tab, label: "Mentions", count: mentionMRs.length },
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
              Could not reach GitLab. Check your PAT in Settings.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs text-neon-pink hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {!isLoading && !isError && currentMRs.length === 0 && (
          <div className="flex items-center justify-center pt-16">
            <div className="text-center">
              <GitMerge className="mx-auto h-10 w-10 text-text-muted opacity-30" />
              <p className="mt-3 text-sm text-text-muted">No merge requests</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {currentMRs.map((mr, i) => (
            <div key={mr.id} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
              <MRCard
                mr={mr}
                onSelect={() => setSelectedMR({ projectId: mr.project_id, iid: mr.iid })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const gitlabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gitlab",
  component: GitLabPage,
});
