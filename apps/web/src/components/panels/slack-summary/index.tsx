import { useCallback } from "react";
import { MessageSquare, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
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

export function SlackSummaryPanel() {
  const navigate = useNavigate();

  const utils = trpc.useUtils();
  useWebSocket(
    useCallback(
      (event: { type: string }) => {
        if (event.type === "slack:summary") {
          utils.slack.threads.latest.invalidate();
        }
        if (event.type === "slack:unread") {
          utils.slack.unreadDmDetails.invalidate();
        }
      },
      [utils],
    ),
  );

  const latest = trpc.slack.threads.latest.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadDms = trpc.slack.unreadDmDetails.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const channelCount = latest.data?.length ?? 0;
  const dmCount = unreadDms.data?.length ?? 0;
  const hasContent = channelCount > 0 || dmCount > 0;

  return (
    <PanelShell
      title="Slack"
      icon={<MessageSquare className="h-4 w-4" />}
      badge={dmCount > 0 ? `${dmCount} DM${dmCount !== 1 ? "s" : ""}` : undefined}
      loading={latest.isLoading}
      error={latest.error?.message}
      className="col-span-full stagger-1"
    >
      <div className="space-y-3">
        {/* Unread DMs */}
        {dmCount > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Unread DMs
            </div>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {unreadDms.data?.map((dm, i) => (
                <button
                  key={dm.channelId}
                  onClick={() => navigate({ to: "/slack" })}
                  className={cn(
                    "animate-glass-in w-full rounded-[10px] border border-[rgba(0,240,255,0.08)] bg-[rgba(0,240,255,0.03)] px-3 py-2 text-left transition-all hover:border-[rgba(0,240,255,0.15)] hover:bg-[rgba(0,240,255,0.06)]",
                    `stagger-${Math.min(i + 1, 5)}`
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-pink/20">
                      <User className="h-2.5 w-2.5 text-neon-cyan" />
                    </div>
                    <span className="text-xs font-semibold text-cream truncate">{dm.userName}</span>
                    <span className="shrink-0 rounded-full bg-[rgba(0,240,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-cyan">
                      {dm.unreadCount}
                    </span>
                  </div>
                  {dm.latestText && (
                    <p className="mt-1 truncate text-[11px] text-text-muted">
                      {dm.latestText}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channel threads */}
        {channelCount > 0 && (
          <div>
            {dmCount > 0 && (
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Channels
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {latest.data?.map(({ channel, thread }, i) => (
                <button
                  key={channel.id}
                  onClick={() => navigate({ to: "/slack", search: { channel: channel.id } })}
                  className={cn(
                    "animate-glass-in w-full rounded-[10px] border border-[rgba(255,45,123,0.05)] bg-[rgba(255,45,123,0.03)] px-3 py-2.5 text-left transition-all hover:border-[rgba(255,45,123,0.1)] hover:bg-[rgba(255,45,123,0.06)]",
                    `stagger-${Math.min(i + 1, 5)}`
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neon-pink">
                      {channel.name}
                    </div>
                    {thread && (
                      <span className="text-[10px] text-text-muted">
                        {timeAgo(thread.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-text-secondary truncate">
                    {thread
                      ? `${thread.parentUser}: ${thread.parentText}`
                      : "No activity yet. Waiting for next poll..."}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!hasContent && (
          <p className="text-xs text-text-muted">
            No channels monitored.{" "}
            <button
              onClick={() => navigate({ to: "/slack" })}
              className="text-neon-pink hover:text-neon-pink-bright"
            >
              Add one on the Slack page
            </button>{" "}
            to get started.
          </p>
        )}
      </div>
    </PanelShell>
  );
}
