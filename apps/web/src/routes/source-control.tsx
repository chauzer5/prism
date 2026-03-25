import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useMemo, useCallback } from "react";
import {
  GitPullRequest,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Users,
  Settings,
  Bot,
  Send,
} from "lucide-react";
import { TeamSetupModal } from "@/components/TeamSetupModal";
import { GitLabPipelineCircles, GitHubCheckCircles } from "@/components/PipelineCircles";
import { trpc } from "@/trpc";
import { cn, timeAgo } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents";

// ── Helpers ──


function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[10px] text-text-muted">no checks</span>;
  const color =
    status === "success"
      ? "text-neon-green"
      : status === "running" || status === "pending"
        ? "text-neon-yellow"
        : status === "failed" || status === "failure"
          ? "text-red-400"
          : "text-text-muted";
  return <span className={cn("text-[10px] font-medium", color)}>{status}</span>;
}

function ProviderBadge({ provider }: { provider: "github" | "gitlab" }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
      provider === "github"
        ? "bg-[rgba(139,92,246,0.12)] text-neon-purple"
        : "bg-[rgba(34,211,238,0.12)] text-neon-cyan",
    )}>
      {provider === "github" ? "GH" : "GL"}
    </span>
  );
}

// ── Unified PR Card ──

interface UnifiedPR {
  provider: "github" | "gitlab";
  id: number;
  number: number;
  repo: string;
  title: string;
  draft: boolean;
  author: string;
  author_username: string;
  source_branch: string;
  web_url: string;
  updated_at: string;
  check_status: string | null;
  approved: boolean;
  has_conflicts: boolean;
  is_mine: boolean;
  is_team_member: boolean;
  needs_your_review: boolean;
  you_are_mentioned: boolean;
}

function PRCard({
  pr,
  onSelect,
  onReview,
  onRequestReview,
}: {
  pr: UnifiedPR;
  onSelect: () => void;
  onReview?: () => void;
  onRequestReview?: () => void;
}) {
  const repoShort = pr.provider === "github"
    ? (pr.repo.split("/").pop() ?? pr.repo)
    : pr.repo;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border px-3.5 py-3 transition-all",
        pr.needs_your_review
          ? "border-neon-pink/30 bg-[rgba(255,45,123,0.06)] hover:border-neon-pink/50"
          : "border-border bg-[rgba(255,45,123,0.02)] hover:border-border-hover hover:bg-[rgba(255,45,123,0.04)]",
      )}
    >
      <div className="flex items-center gap-3">
        {/* Left content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProviderBadge provider={pr.provider} />
            <span className="text-[10px] font-mono text-neon-pink">
              {pr.provider === "github" ? "#" : "!"}{pr.number}
            </span>
            <span className="text-[10px] font-mono text-text-muted">{repoShort}</span>
            <div className="flex items-center gap-1">
              {pr.draft && (
                <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">
                  draft
                </span>
              )}
              {pr.has_conflicts && (
                <span className="rounded-full bg-[rgba(239,68,68,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-red-400">
                  conflicts
                </span>
              )}
              {pr.you_are_mentioned && (
                <span className="rounded-full bg-[rgba(255,45,123,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
                  @you
                </span>
              )}
              {pr.needs_your_review && (
                <span className="rounded-full bg-[rgba(255,45,123,0.15)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
                  review requested
                </span>
              )}
            </div>
          </div>
          <div className={cn("mt-1 text-xs font-medium text-cream", pr.draft && "opacity-60")}>
            {pr.title}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
            <span>{pr.author}</span>
            <span>·</span>
            <span className="font-mono truncate max-w-[120px]">{pr.source_branch}</span>
            <span>·</span>
            <span>{timeAgo(pr.updated_at)}</span>
          </div>
        </div>

        {/* Right status indicators */}
        <div className="flex shrink-0 items-center gap-2.5">
          {onRequestReview && (
            <button
              onClick={(e) => { e.stopPropagation(); onRequestReview(); }}
              className="flex items-center gap-1 rounded-md border border-neon-pink/30 bg-[rgba(255,45,123,0.08)] px-2 py-1.5 text-[10px] font-medium text-neon-pink transition-all hover:border-neon-pink/60 hover:bg-[rgba(255,45,123,0.15)] hover:shadow-[0_0_8px_rgba(255,45,123,0.3)]"
              title="Launch agent to request MR review on Slack"
            >
              <Send className="h-3 w-3" />
              Request
            </button>
          )}
          {onReview && (
            <button
              onClick={(e) => { e.stopPropagation(); onReview(); }}
              className="flex items-center gap-1 rounded-md border border-neon-cyan/30 bg-[rgba(34,211,238,0.08)] px-2 py-1.5 text-[10px] font-medium text-neon-cyan transition-all hover:border-neon-cyan/60 hover:bg-[rgba(34,211,238,0.15)] hover:shadow-[0_0_8px_rgba(34,211,238,0.3)]"
              title="Launch agent to review MR"
            >
              <Bot className="h-3 w-3" />
              Review
            </button>
          )}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-[10px] font-medium",
                pr.check_status === "success" ? "text-neon-green"
                  : pr.check_status === "running" || pr.check_status === "pending" ? "text-neon-yellow"
                  : pr.check_status === "failed" || pr.check_status === "failure" ? "text-red-400"
                  : pr.check_status === "manual" || pr.check_status === "created" || pr.check_status === "waiting_for_resource" || pr.check_status === "scheduled" ? "text-neon-purple"
                  : "text-text-muted",
              )}>
                Pipeline
              </span>
              <div className={cn(
                "h-2.5 w-2.5 rounded-full",
                pr.check_status === "success" ? "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]"
                  : pr.check_status === "running" || pr.check_status === "pending" ? "bg-neon-yellow shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                  : pr.check_status === "failed" || pr.check_status === "failure" ? "bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  : pr.check_status === "manual" || pr.check_status === "created" || pr.check_status === "waiting_for_resource" || pr.check_status === "scheduled" ? "bg-neon-purple shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                  : "bg-text-muted/40",
              )} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-[10px] font-medium",
                pr.approved ? "text-neon-green" : "text-text-muted",
              )}>
                Approval
              </span>
              <div className={cn(
                "h-2.5 w-2.5 rounded-full",
                pr.approved
                  ? "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]"
                  : "bg-text-muted/40",
              )} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── GitLab MR Detail View ──

function GitLabDetailView({
  projectId,
  mrIid,
  onBack,
}: {
  projectId: number;
  mrIid: number;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.sourceControl.gitlabMRDetail.useQuery(
    { projectId, mrIid },
  );
  const [commentText, setCommentText] = useState("");
  const addNote = trpc.sourceControl.gitlabAddNote.useMutation({ onSuccess: () => { setCommentText(""); refetch(); } });
  const merge = trpc.sourceControl.gitlabMerge.useMutation({ onSuccess: () => refetch() });
  const play = trpc.sourceControl.gitlabPlayJob.useMutation({ onSuccess: () => refetch() });
  const retry = trpc.sourceControl.gitlabRetryJob.useMutation({ onSuccess: () => refetch() });
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
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <ProviderBadge provider="gitlab" />
        <span className="font-mono text-xs text-neon-pink">!{mrIid}</span>
        {detail && (
          <a href={detail.web_url} target="_blank" rel="noopener noreferrer" className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink" title="Open in GitLab">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isLoading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neon-pink" /></div>}
      {isError && <div className="p-4 text-xs text-red-400">Failed to load MR detail</div>}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", detail.state === "opened" ? "bg-[rgba(34,197,94,0.15)] text-neon-green" : "bg-[rgba(107,114,128,0.15)] text-text-muted")}>{detail.state}</span>
              {detail.draft && <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-2 py-0.5 font-semibold text-text-muted">draft</span>}
              <span className="text-text-muted">{detail.author}</span>
              <span className="font-mono text-text-muted">{detail.source_branch} → {detail.target_branch}</span>
              {detail.changes_count !== "0" && <span className="text-text-muted">{detail.changes_count} changes</span>}
            </div>
          </div>

          {detail.jobs.length > 0 && (
            <GitLabPipelineCircles
              jobs={detail.jobs}
              pipelineStatus={detail.pipeline_status}
              onPlay={(jobId) => play.mutate({ projectId, jobId })}
              onRetry={(jobId) => retry.mutate({ projectId, jobId })}
            />
          )}

          {detail.approval_rules.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Approvals</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.approval_rules.filter((r) => r.rule_type !== "any_approver" && r.rule_type !== "report_approver" && r.rule_type !== "code_owner").map((rule) => (
                  <span key={rule.name} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", rule.approved ? "bg-[rgba(34,197,94,0.12)] text-neon-green" : "bg-[rgba(255,45,123,0.12)] text-neon-pink")}>
                    {rule.approved ? <Check className="mr-1 inline h-2.5 w-2.5" /> : null}
                    {rule.name}
                    {rule.approved_by.length > 0 && <span className="ml-1 opacity-70">({rule.approved_by.join(", ")})</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {detail.description && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Description</h3>
              <div className="rounded-lg border border-border bg-[rgba(0,0,0,0.2)] p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{detail.description}</div>
            </section>
          )}

          {detail.discussions.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Discussions ({detail.discussions.length})</h3>
              <div className="space-y-2">
                {detail.discussions.map((disc) => (
                  <div key={disc.id} className={cn("rounded-lg border px-3 py-2", disc.resolved ? "border-border/50 opacity-60" : "border-border")}>
                    <button onClick={() => toggleDiscussion(disc.id)} className="flex w-full items-center gap-1.5 text-left">
                      {expandedDiscussions.has(disc.id) ? <ChevronDown className="h-3 w-3 text-text-muted" /> : <ChevronRight className="h-3 w-3 text-text-muted" />}
                      <span className="text-xs font-medium text-cream">{disc.notes[0]?.author}</span>
                      {disc.resolved && <Check className="h-3 w-3 text-neon-green" />}
                      <span className="ml-auto text-[10px] text-text-muted">{disc.notes.length} {disc.notes.length === 1 ? "note" : "notes"}</span>
                    </button>
                    {expandedDiscussions.has(disc.id) && (
                      <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                        {disc.notes.map((note) => (
                          <div key={note.id}>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="font-medium text-cream">{note.author}</span>
                              <span className="text-text-muted">{timeAgo(note.created_at)}</span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{note.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Add Comment</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y" />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => addNote.mutate({ projectId, mrIid, body: commentText })} disabled={addNote.isPending || !commentText.trim()}
                className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50">
                {addNote.isPending ? "Posting..." : "Comment"}
              </button>
              {detail.can_merge && (
                <button onClick={() => merge.mutate({ projectId, mrIid })} disabled={merge.isPending}
                  className="rounded-lg bg-[rgba(34,197,94,0.15)] px-3 py-1.5 text-xs font-medium text-neon-green transition-all hover:bg-[rgba(34,197,94,0.25)] disabled:opacity-50">
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

// ── GitHub PR Detail View ──

function GitHubDetailView({
  repo,
  prNumber,
  onBack,
}: {
  repo: string;
  prNumber: number;
  onBack: () => void;
}) {
  const { data: detail, isLoading, isError, refetch } = trpc.sourceControl.githubPRDetail.useQuery(
    { repo, prNumber },
  );
  const [commentText, setCommentText] = useState("");
  const addComment = trpc.sourceControl.githubAddComment.useMutation({ onSuccess: () => { setCommentText(""); refetch(); } });
  const merge = trpc.sourceControl.githubMerge.useMutation({ onSuccess: () => refetch() });
  const rerun = trpc.sourceControl.githubRerunCheck.useMutation({ onSuccess: () => refetch() });
  const [expandedComments, setExpandedComments] = useState(true);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted hover:text-cream">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <ProviderBadge provider="github" />
        <span className="font-mono text-xs text-neon-pink">#{prNumber}</span>
        {detail && (
          <a href={detail.web_url} target="_blank" rel="noopener noreferrer" className="ml-auto rounded p-1 text-text-muted hover:text-neon-pink" title="Open in GitHub">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isLoading && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-neon-pink" /></div>}
      {isError && <div className="p-4 text-xs text-red-400">Failed to load PR detail</div>}
      {detail && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-cream">{detail.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", detail.state === "open" ? "bg-[rgba(34,197,94,0.15)] text-neon-green" : "bg-[rgba(107,114,128,0.15)] text-text-muted")}>{detail.state}</span>
              {detail.draft && <span className="rounded-full bg-[rgba(107,114,128,0.15)] px-2 py-0.5 font-semibold text-text-muted">draft</span>}
              <span className="text-text-muted">{detail.author}</span>
              <span className="font-mono text-text-muted">{detail.source_branch} → {detail.target_branch}</span>
              {detail.changed_files > 0 && <span className="text-text-muted">{detail.changed_files} files changed</span>}
            </div>
          </div>

          {detail.checks.length > 0 && (
            <GitHubCheckCircles
              checks={detail.checks}
              onRerun={(checkRunId) => rerun.mutate({ repo, checkRunId })}
            />
          )}

          {detail.reviews.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Reviews</h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.reviews.map((review) => (
                  <span key={review.user} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    review.state === "APPROVED" ? "bg-[rgba(34,197,94,0.12)] text-neon-green"
                    : review.state === "CHANGES_REQUESTED" ? "bg-[rgba(239,68,68,0.12)] text-red-400"
                    : "bg-[rgba(107,114,128,0.12)] text-text-muted",
                  )}>
                    {review.state === "APPROVED" && <Check className="mr-1 inline h-2.5 w-2.5" />}
                    {review.state === "CHANGES_REQUESTED" && <X className="mr-1 inline h-2.5 w-2.5" />}
                    {review.user}
                    <span className="ml-1 opacity-70">({review.state.toLowerCase().replace("_", " ")})</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {detail.description && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Description</h3>
              <div className="rounded-lg border border-border bg-[rgba(0,0,0,0.2)] p-3 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{detail.description}</div>
            </section>
          )}

          {detail.comments.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                <button onClick={() => setExpandedComments((v) => !v)} className="flex items-center gap-1">
                  {expandedComments ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Comments ({detail.comments.length})
                </button>
              </h3>
              {expandedComments && (
                <div className="space-y-2">
                  {detail.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-medium text-cream">{comment.author}</span>
                        <span className="text-text-muted">{timeAgo(comment.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Add Comment</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-2 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none resize-y" />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => addComment.mutate({ repo, prNumber, body: commentText })} disabled={addComment.isPending || !commentText.trim()}
                className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50">
                {addComment.isPending ? "Posting..." : "Comment"}
              </button>
              {detail.can_merge && (
                <button onClick={() => merge.mutate({ repo, prNumber })} disabled={merge.isPending}
                  className="rounded-lg bg-[rgba(34,197,94,0.15)] px-3 py-1.5 text-xs font-medium text-neon-green transition-all hover:bg-[rgba(34,197,94,0.25)] disabled:opacity-50">
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

type Tab = "mine" | "team" | "review";
type SelectedPR = { provider: "github"; repo: string; number: number } | { provider: "gitlab"; projectId: number; iid: number };

function SourceControlPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const [selectedPR, setSelectedPR] = useState<SelectedPR | null>(null);
  const [showTeamSetup, setShowTeamSetup] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoMergeTodoQuery = trpc.settings.get.useQuery({ key: "sourceControl.autoMergeTodo" });
  const autoMergeTodoEnabled = autoMergeTodoQuery.data === "true";
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => utils.settings.get.invalidate({ key: "sourceControl.autoMergeTodo" }),
  });
  const { data: allPRs, isLoading, isError, refetch } = trpc.sourceControl.pullRequests.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const { data: teamMembers } = trpc.team.members.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const setSelectedAgentId = useAgentsStore((s) => s.setSelectedAgentId);
  const spawnAgent = trpc.agents.spawn.useMutation({
    onSuccess: (data) => {
      setSelectedAgentId(data.id);
      navigate({ to: "/agents" });
    },
  });

  const handleReview = useCallback((pr: UnifiedPR) => {
    spawnAgent.mutate({
      prompt: `/gitlab-review-mr ${pr.web_url}`,
      name: `Review !${pr.number}`,
    });
  }, [spawnAgent]);

  const handleRequestReview = useCallback((pr: UnifiedPR) => {
    spawnAgent.mutate({
      prompt: `/gitlab-request-mr-review ${pr.web_url}`,
      name: `Request Review !${pr.number}`,
    });
  }, [spawnAgent]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await utils.sourceControl.pullRequests.invalidate();
    } finally {
      setSyncing(false);
    }
  }, [utils]);
  const teamConfigured = teamMembers && teamMembers.length > 0;

  const { myPRs, teamPRs, reviewPRs } = useMemo(() => {
    if (!allPRs) return { myPRs: [], teamPRs: [], reviewPRs: [] };
    return {
      myPRs: allPRs.filter((pr) => pr.is_mine),
      teamPRs: allPRs.filter((pr) => pr.is_team_member),
      reviewPRs: allPRs.filter((pr) => pr.needs_your_review),
    };
  }, [allPRs]);

  const currentPRs =
    tab === "mine"
      ? myPRs
      : tab === "team"
        ? teamPRs
        : reviewPRs;

  if (selectedPR) {
    if (selectedPR.provider === "gitlab") {
      return (
        <div className="flex h-full flex-col">
          <GitLabDetailView
            projectId={selectedPR.projectId}
            mrIid={selectedPR.iid}
            onBack={() => setSelectedPR(null)}
          />
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col">
        <GitHubDetailView
          repo={selectedPR.repo}
          prNumber={selectedPR.number}
          onBack={() => setSelectedPR(null)}
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
            Source Control
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">Pull/Merge requests</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>Create merge to-dos</span>
            <button
              onClick={() =>
                setSetting.mutate({
                  key: "sourceControl.autoMergeTodo",
                  value: autoMergeTodoEnabled ? "false" : "true",
                })
              }
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                autoMergeTodoEnabled
                  ? "bg-neon-pink shadow-[0_0_8px_rgba(255,45,123,0.4)]"
                  : "bg-[rgba(107,114,128,0.3)]",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  autoMergeTodoEnabled ? "left-[18px]" : "left-0.5",
                )}
              />
            </button>
          </label>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]",
            syncing && "pointer-events-none opacity-60"
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync"}
        </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { key: "mine" as Tab, label: "Mine", count: myPRs.length },
          { key: "team" as Tab, label: "Team", count: teamPRs.length },
          { key: "review" as Tab, label: "Needs Review", count: reviewPRs.length },
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
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              tab === t.key ? "bg-[rgba(255,45,123,0.12)] text-neon-pink" : "bg-[rgba(107,114,128,0.1)] text-text-muted",
            )}>
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
              Could not load PRs. Check your tokens in Settings.
            </p>
            <button onClick={() => refetch()} className="mt-2 text-xs text-neon-pink hover:underline">
              Retry
            </button>
          </div>
        )}
        {/* Team tab: setup prompt if no team configured */}
        {!isLoading && !isError && tab === "team" && !teamConfigured && (
          <div className="flex items-center justify-center pt-16">
            <div className="text-center">
              <Users className="mx-auto h-10 w-10 text-text-muted opacity-30" />
              <p className="mt-3 text-sm text-text-muted">No team configured</p>
              <p className="mt-1 text-xs text-text-muted">
                Select your teammates to see their PRs here
              </p>
              <button
                onClick={() => setShowTeamSetup(true)}
                className="mt-4 rounded-lg bg-neon-pink-dark px-4 py-2 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink"
              >
                Set Up Team
              </button>
            </div>
          </div>
        )}
        {/* Team tab: edit button + PR list when team is configured */}
        {!isLoading && !isError && tab === "team" && teamConfigured && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] text-text-muted">
                {teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setShowTeamSetup(true)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-muted transition-all hover:border-border-hover hover:text-cream"
              >
                <Settings className="h-3 w-3" />
                Edit Team
              </button>
            </div>
            {currentPRs.length === 0 && (
              <div className="flex items-center justify-center pt-12">
                <div className="text-center">
                  <GitPullRequest className="mx-auto h-10 w-10 text-text-muted opacity-30" />
                  <p className="mt-3 text-sm text-text-muted">No pull requests</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {currentPRs.map((pr, i) => (
                <div key={`${pr.provider}-${pr.id}`} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
                  <PRCard
                    pr={pr}
                    onSelect={() => {
                      if (pr.provider === "gitlab") {
                        setSelectedPR({ provider: "gitlab", projectId: Number(pr.repo), iid: pr.number });
                      } else {
                        setSelectedPR({ provider: "github", repo: pr.repo, number: pr.number });
                      }
                    }}
                    onReview={pr.provider === "gitlab" ? () => handleReview(pr) : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {/* Non-team tabs */}
        {!isLoading && !isError && tab !== "team" && (
          <>
            {currentPRs.length === 0 && (
              <div className="flex items-center justify-center pt-16">
                <div className="text-center">
                  <GitPullRequest className="mx-auto h-10 w-10 text-text-muted opacity-30" />
                  <p className="mt-3 text-sm text-text-muted">No pull requests</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {currentPRs.map((pr, i) => (
                <div key={`${pr.provider}-${pr.id}`} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
                  <PRCard
                    pr={pr}
                    onSelect={() => {
                      if (pr.provider === "gitlab") {
                        setSelectedPR({ provider: "gitlab", projectId: Number(pr.repo), iid: pr.number });
                      } else {
                        setSelectedPR({ provider: "github", repo: pr.repo, number: pr.number });
                      }
                    }}
                    onReview={pr.provider === "gitlab" ? () => handleReview(pr) : undefined}
                    onRequestReview={tab === "mine" && pr.provider === "gitlab" ? () => handleRequestReview(pr) : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Team setup modal */}
      {showTeamSetup && <TeamSetupModal onClose={() => setShowTeamSetup(false)} />}
    </div>
  );
}

export const sourceControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/source-control",
  component: SourceControlPage,
});
