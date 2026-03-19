import { useState, useRef } from "react";
import { Play, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──

interface PipelineJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  allow_failure?: boolean;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

// ── Helpers ──

function jobColor(status: string, allowFailure?: boolean): string {
  if (status === "success") return "border-neon-green text-neon-green shadow-[0_0_6px_rgba(var(--color-neon-green),0.4)]";
  if (status === "failed") return allowFailure ? "border-neon-yellow text-neon-yellow" : "border-red-400 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)]";
  if (status === "running") return "border-neon-cyan text-neon-cyan shadow-[0_0_6px_rgba(var(--color-neon-cyan),0.4)] animate-pulse";
  if (status === "pending") return "border-neon-yellow text-neon-yellow";
  if (status === "manual") return "border-neon-purple text-neon-purple";
  if (status === "skipped") return "border-border text-text-muted opacity-40";
  return "border-border text-text-muted";
}

function checkColor(check: CheckRun): string {
  if (check.conclusion === "success") return "border-neon-green text-neon-green shadow-[0_0_6px_rgba(var(--color-neon-green),0.4)]";
  if (check.conclusion === "failure") return "border-red-400 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)]";
  if (check.status === "in_progress") return "border-neon-cyan text-neon-cyan shadow-[0_0_6px_rgba(var(--color-neon-cyan),0.4)] animate-pulse";
  if (check.conclusion === "skipped" || check.conclusion === "neutral") return "border-border text-text-muted opacity-40";
  return "border-neon-yellow text-neon-yellow";
}

function stageStatus(jobs: PipelineJob[]): string {
  if (jobs.some((j) => j.status === "failed" && !j.allow_failure)) return "failed";
  if (jobs.some((j) => j.status === "running")) return "running";
  if (jobs.some((j) => j.status === "pending")) return "pending";
  if (jobs.every((j) => j.status === "success" || j.status === "skipped" || j.allow_failure)) return "success";
  if (jobs.every((j) => j.status === "manual")) return "manual";
  if (jobs.every((j) => j.status === "skipped")) return "skipped";
  return "pending";
}

function connectorColor(status: string): string {
  if (status === "success") return "bg-neon-green";
  if (status === "failed") return "bg-red-400";
  if (status === "running") return "bg-neon-cyan";
  if (status === "pending") return "bg-neon-yellow";
  return "bg-border";
}

// ── Tooltip ──

interface TooltipData {
  label: string;
  items: { id: number; name: string; status: string; allowFailure?: boolean; isCheck?: boolean }[];
  x: number;
  y: number;
}

function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  function show(label: string, items: TooltipData["items"], e: React.MouseEvent) {
    clearTimeout(hideTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, items, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }

  function scheduleHide() {
    hideTimeout.current = setTimeout(() => setTooltip(null), 150);
  }

  function cancelHide() {
    clearTimeout(hideTimeout.current);
  }

  return { tooltip, show, scheduleHide, cancelHide };
}

// ── GitLab Pipeline Circles ──

export function GitLabPipelineCircles({
  jobs,
  pipelineStatus,
  onPlay,
  onRetry,
}: {
  jobs: PipelineJob[];
  pipelineStatus: string | null;
  onPlay?: (jobId: number) => void;
  onRetry?: (jobId: number) => void;
}) {
  const { tooltip, show, scheduleHide, cancelHide } = useTooltip();

  const stageMap = new Map<string, PipelineJob[]>();
  // GitLab returns jobs in reverse order — reverse to get stages in pipeline order
  for (const job of [...jobs].reverse()) {
    const existing = stageMap.get(job.stage) ?? [];
    existing.push(job);
    stageMap.set(job.stage, existing);
  }
  const stages = [...stageMap.entries()];

  if (stages.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
        Pipeline {pipelineStatus && <span className="ml-1 font-mono normal-case">{pipelineStatus}</span>}
      </h3>
      <div className="flex items-center flex-wrap gap-3 py-1">
        {stages.map(([stage, stageJobs]) => {
          const ss = stageStatus(stageJobs);
          return (
            <div key={stage} className="flex items-center">
              <div
                className="group relative flex flex-col items-center gap-1 shrink-0"
                onMouseEnter={(e) => show(stage, stageJobs.map((j) => ({ id: j.id, name: j.name, status: j.status, allowFailure: j.allow_failure })), e)}
                onMouseLeave={scheduleHide}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2 bg-background transition-transform group-hover:scale-125",
                  jobColor(ss),
                )}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                </div>
                <span className="max-w-[50px] truncate font-mono text-[7px] text-text-muted">{stage.replace(/^\./, "")}</span>
              </div>
            </div>
          );
        })}
      </div>
      {tooltip && (
        <div
          className="fixed z-[99999] rounded-lg border border-border bg-popover px-3 py-2 shadow-xl min-w-[180px] max-w-[280px]"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)" }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-1.5 pb-1.5 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-text-primary">{tooltip.label}</div>
          {tooltip.items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 py-0.5">
              <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", {
                "bg-neon-green": item.status === "success",
                "bg-red-400": item.status === "failed" && !item.allowFailure,
                "bg-neon-yellow": item.status === "pending" || (item.status === "failed" && item.allowFailure),
                "bg-neon-cyan": item.status === "running",
                "bg-neon-purple": item.status === "manual",
                "bg-text-muted opacity-40": item.status === "skipped",
              })} />
              <span className="flex-1 truncate font-mono text-[9px] text-text-secondary">{item.name}</span>
              <span className="text-[8px] uppercase text-text-muted shrink-0">{item.status}</span>
              {item.status === "manual" && onPlay && (
                <button onClick={() => onPlay(item.id)} className="shrink-0 rounded border border-neon-purple/30 p-0.5 text-neon-purple hover:bg-neon-purple/10">
                  <Play className="h-2 w-2" />
                </button>
              )}
              {item.status === "failed" && onRetry && (
                <button onClick={() => onRetry(item.id)} className="shrink-0 rounded border border-red-400/30 p-0.5 text-red-400 hover:bg-red-400/10">
                  <RotateCw className="h-2 w-2" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── GitHub Check Circles ──

export function GitHubCheckCircles({
  checks,
  onRerun,
}: {
  checks: CheckRun[];
  onRerun?: (checkRunId: number) => void;
}) {
  const { tooltip, show, scheduleHide, cancelHide } = useTooltip();

  if (checks.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Checks</h3>
      <div className="flex items-center flex-wrap gap-2 py-1">
        {checks.map((check) => (
          <div
            key={check.id}
            className="group relative flex flex-col items-center gap-1 shrink-0"
            onMouseEnter={(e) => show(check.name, [{ id: check.id, name: check.name, status: check.conclusion ?? check.status, isCheck: true }], e)}
            onMouseLeave={scheduleHide}
          >
            <div className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2 bg-background transition-transform group-hover:scale-125",
              checkColor(check),
            )}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </div>
          </div>
        ))}
      </div>
      {tooltip && (
        <div
          className="fixed z-[99999] rounded-lg border border-border bg-popover px-3 py-2 shadow-xl min-w-[180px] max-w-[280px]"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)" }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-1.5 pb-1.5 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-text-primary">{tooltip.label}</div>
          {tooltip.items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 py-0.5">
              <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", {
                "bg-neon-green": item.status === "success",
                "bg-red-400": item.status === "failure",
                "bg-neon-cyan": item.status === "in_progress",
                "bg-neon-yellow": item.status === "queued",
                "bg-text-muted opacity-40": item.status === "skipped" || item.status === "neutral",
              })} />
              <span className="flex-1 truncate font-mono text-[9px] text-text-secondary">{item.name}</span>
              <span className="text-[8px] uppercase text-text-muted shrink-0">{item.status}</span>
              {item.status === "failure" && onRerun && (
                <button onClick={() => onRerun(item.id)} className="shrink-0 rounded border border-red-400/30 p-0.5 text-red-400 hover:bg-red-400/10">
                  <RotateCw className="h-2 w-2" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
