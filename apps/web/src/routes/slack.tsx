import { createRoute, useNavigate } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useCallback, useEffect } from "react";
import { MessageSquare, Plus, Trash2, RefreshCw, Shield, Loader2, ExternalLink, User } from "lucide-react";
import { emojify } from "node-emoji";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
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

function openInSlack(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function slackMessageUrl(slackChannelId: string, messageTs: string, domain?: string | null): string {
  // Use the native archives URL which Slack Desktop handles correctly
  const host = domain ? `${domain}.slack.com` : "slack.com";
  if (messageTs) {
    const tsForUrl = "p" + messageTs.replace(".", "");
    return `https://${host}/archives/${slackChannelId}/${tsForUrl}`;
  }
  return `https://${host}/archives/${slackChannelId}`;
}

interface ThreadMessage {
  user: string;
  text: string;
  ts: string;
  threadTs?: string;
}

/** Render Slack message text with clickable links and emoji. Handles <url>, <url|label>, and :emoji: formats. */
function SlackText({ text, className }: { text: string; className?: string }) {
  const withEmoji = emojify(text, { fallback: (name) => `:${name}:` });
  const parts = withEmoji.split(/(<https?:\/\/[^>]+>)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const match = part.match(/^<(https?:\/\/[^|>]+)(?:\|([^>]+))?>$/);
        if (match) {
          const url = match[1];
          const label = match[2] ?? url;
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan hover:underline break-all"
            >
              {label}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Thread Card ──

function ThreadCard({
  thread,
  slackChannelId,
  domain,
  showChannel,
}: {
  thread: {
    id: string;
    channelName: string;
    conversationTs: string;
    messages: string;
    mentionsMe: boolean;
    parentText: string;
    parentUser: string;
    messageCount: number;
    lastMessageAt: string;
    channelId: string;
  };
  slackChannelId?: string;
  domain?: string | null;
  showChannel?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const messages: ThreadMessage[] = expanded ? JSON.parse(thread.messages) : [];

  return (
    <div
      className={cn(
        "group rounded-lg border border-[rgba(255,45,123,0.06)] bg-[rgba(255,45,123,0.02)] px-3 py-2.5 transition-all hover:border-[rgba(255,45,123,0.12)]",
        thread.mentionsMe && "border-[rgba(0,240,255,0.15)] bg-[rgba(0,240,255,0.02)]"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {showChannel && (
              <span className="rounded-full bg-[rgba(255,45,123,0.1)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-pink">
                {thread.channelName}
              </span>
            )}
            <span className="text-[10px] font-semibold text-cream">{thread.parentUser}</span>
            <span className="text-[10px] text-text-muted">{timeAgo(thread.lastMessageAt)}</span>
            {thread.mentionsMe && (
              <span className="rounded-full bg-[rgba(0,240,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-cyan">
                mentioned
              </span>
            )}
          </div>
          <SlackText text={thread.parentText} className="mt-1 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap" />
          <div className="mt-1.5 flex items-center gap-2">
            {thread.messageCount > 1 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] text-neon-pink hover:underline"
              >
                {expanded ? "Hide" : `${thread.messageCount - 1} ${thread.messageCount === 2 ? "reply" : "replies"}`}
              </button>
            )}
          </div>
        </div>
        {slackChannelId && (
          <button
            onClick={() => openInSlack(slackMessageUrl(slackChannelId, thread.conversationTs, domain))}
            className="mt-0.5 shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:text-neon-cyan group-hover:opacity-100"
            title="Open in Slack"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Expanded thread replies */}
      {expanded && messages.length > 1 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3 ml-1">
          {messages.slice(1).map((msg) => (
            <div key={msg.ts}>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-cream">{msg.user}</span>
              </div>
              <SlackText text={msg.text} className="text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

function SlackPage() {
  const navigate = useNavigate();
  const search = slackRoute.useSearch();
  const selectedChannelId = search.channel ?? null;

  const [showAddForm, setShowAddForm] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const utils = trpc.useUtils();

  // Refresh on WS events
  const onWsEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === "slack:summary") {
        utils.slack.threads.invalidate();
        utils.slack.channels.list.invalidate();
      }
      if (event.type === "slack:unread") {
        utils.slack.unreadDmDetails.invalidate();
      }
    },
    [utils]
  );
  useWebSocket(onWsEvent);

  const authStatus = trpc.slack.auth.status.useQuery();
  const refreshAuth = trpc.slack.auth.refresh.useMutation({
    onSuccess: () => utils.slack.auth.status.invalidate(),
  });

  const channels = trpc.slack.channels.list.useQuery();
  const unreadDms = trpc.slack.unreadDmDetails.useQuery(undefined, { refetchInterval: 30_000 });

  const channelThreads = trpc.slack.threads.byChannel.useQuery(
    { channelId: selectedChannelId! },
    { enabled: !!selectedChannelId, refetchInterval: 30_000 }
  );

  const addChannel = trpc.slack.channels.add.useMutation({
    onMutate: async (input) => {
      await utils.slack.channels.list.cancel();
      const previous = utils.slack.channels.list.getData();
      utils.slack.channels.list.setData(undefined, (old) => [
        ...(old ?? []),
        {
          id: `temp-${Date.now()}`,
          slackChannelId: "",
          name: input.name.startsWith("#") ? input.name : `#${input.name}`,
          enabled: true,
          lastPolledAt: null,
          teamId: input.teamId ?? null,
          sortOrder: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setChannelName("");
      setShowAddForm(false);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) utils.slack.channels.list.setData(undefined, context.previous);
    },
    onSettled: (_data) => {
      utils.slack.channels.list.invalidate();
      if (_data?.id) pollChannel.mutate({ channelId: _data.id });
    },
  });

  const removeChannel = trpc.slack.channels.remove.useMutation({
    onSuccess: () => {
      utils.slack.channels.list.invalidate();
      utils.slack.threads.latest.invalidate();
      if (selectedChannelId) {
        navigate({ to: "/slack", search: {} });
      }
    },
  });

  const pollNow = trpc.slack.pollNow.useMutation({
    onSuccess: () => {
      utils.slack.threads.invalidate();
      utils.slack.channels.list.invalidate();
    },
  });

  const pollChannel = trpc.slack.pollChannel.useMutation({
    onSuccess: () => {
      utils.slack.threads.invalidate();
      utils.slack.channels.list.invalidate();
    },
  });

  const selectedChannel = channels.data?.find((c) => c.id === selectedChannelId);

  // Build a lookup from internal channel ID to Slack channel info for links
  const workspaceDomains = new Map(
    (authStatus.data?.workspaces ?? []).map((w) => [w.teamId, w.domain]),
  );
  const channelLookup = new Map(
    (channels.data ?? []).map((c) => [c.id, {
      slackChannelId: c.slackChannelId,
      domain: c.teamId ? workspaceDomains.get(c.teamId) : undefined,
    }]),
  );

  // Auto-select first channel if none selected
  useEffect(() => {
    if (!selectedChannelId && channels.data && channels.data.length > 0) {
      navigate({ to: "/slack", search: { channel: channels.data[0].id }, replace: true });
    }
  }, [selectedChannelId, channels.data, navigate]);

  const workspaces = authStatus.data?.workspaces ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Slack</h1>
          <p className="mt-0.5 text-xs text-text-muted">DMs and channel threads</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshAuth.mutate()}
            disabled={refreshAuth.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)] disabled:opacity-50"
            title="Refresh Slack credentials"
          >
            <Shield className={cn("h-3.5 w-3.5", refreshAuth.isPending && "animate-spin")} />
            Refresh Auth
          </button>
          <button
            onClick={() => pollNow.mutate()}
            disabled={pollNow.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 py-[7px] text-xs font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pollNow.isPending && "animate-spin")} />
            Sync
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — DMs + channel list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          {/* Unread DMs section */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Direct Messages
              </div>
              {(unreadDms.data?.length ?? 0) > 0 && (
                <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                  {unreadDms.data!.length}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-0.5 border-b border-border p-2">
            {(unreadDms.data?.length ?? 0) === 0 && (
              <p className="px-3 py-2 text-[11px] text-text-muted">No unread messages</p>
            )}
            {unreadDms.data?.map((dm) => {
              const domain = dm.teamId ? workspaceDomains.get(dm.teamId) : undefined;
              const dmUrl = domain
                ? `https://${domain}.slack.com/archives/${dm.channelId}`
                : `https://slack.com/app_redirect?channel=${dm.channelId}`;
              return (
                <button
                  key={dm.channelId}
                  onClick={() => {
                    openInSlack(dmUrl);
                    // Optimistically remove from the list
                    utils.slack.unreadDmDetails.setData(undefined, (old) =>
                      (old ?? []).filter((d) => d.channelId !== dm.channelId),
                    );
                    utils.slack.unreadDms.setData(undefined, (old) =>
                      old ? { ...old, unreadCount: Math.max(0, old.unreadCount - 1) } : old,
                    );
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-all hover:bg-[rgba(255,45,123,0.04)]"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-cyan/20 to-neon-pink/20 mt-0.5">
                    <User className="h-3 w-3 text-neon-cyan" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-cream truncate">{dm.userName}</span>
                      <span className="shrink-0 rounded-full bg-[rgba(0,240,255,0.12)] px-1.5 py-0.5 text-[9px] font-semibold text-neon-cyan">
                        {dm.unreadCount}
                      </span>
                    </div>
                    {dm.latestText && (
                      <p className="mt-0.5 truncate text-[11px] text-text-muted">
                        {dm.latestText}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Channels section */}
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Channels
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {channels.data?.map((channel, i) => {
              const isTemp = channel.id.startsWith("temp-");
              return (
                <div
                  key={channel.id}
                  onClick={() => {
                    if (!isTemp) {
                      navigate({ to: "/slack", search: { channel: channel.id } });
                    }
                  }}
                  className={cn(
                    "animate-glass-in group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-all",
                    `stagger-${Math.min(i + 1, 5)}`,
                    isTemp && "opacity-40",
                    selectedChannelId === channel.id
                      ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                      : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isTemp ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neon-pink opacity-60" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neon-pink opacity-60" />
                    )}
                    <div className="truncate text-xs font-semibold">{channel.name}</div>
                  </div>
                  {!isTemp && (
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openInSlack(slackMessageUrl(channel.slackChannelId, "", channel.teamId ? workspaceDomains.get(channel.teamId) : undefined));
                        }}
                        className="rounded p-1 text-text-muted hover:text-neon-cyan"
                        title="Open in Slack"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeChannel.mutate({ id: channel.id });
                        }}
                        className="rounded p-1 text-text-muted hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {channels.data?.length === 0 && (
              <p className="px-3 py-4 text-xs text-text-muted">
                No channels. Add one below.
              </p>
            )}
          </div>

          {/* Add channel */}
          <div className="border-t border-border p-3">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(255,45,123,0.15)] bg-[rgba(255,45,123,0.06)] px-3 py-2 text-xs font-medium text-neon-pink transition-all hover:bg-[rgba(255,45,123,0.1)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Channel
              </button>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (channelName.trim()) {
                    addChannel.mutate({
                      name: channelName,
                      teamId: selectedTeamId || undefined,
                    });
                  }
                }}
              >
                {workspaces.length > 1 && (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream focus:border-neon-pink/30 focus:outline-none"
                  >
                    <option value="">All workspaces</option>
                    {workspaces.map((ws) => (
                      <option key={ws.teamId} value={ws.teamId}>
                        {ws.teamName}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="#channel-name"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={!channelName.trim() || addChannel.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setChannelName("");
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
                {addChannel.error && (
                  <p className="text-xs text-red-400">{addChannel.error.message}</p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Main area — channel threads */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedChannelId && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <MessageSquare className="h-4 w-4 text-neon-pink" />
              <span className="text-sm font-semibold text-cream">
                {channels.data?.find((c) => c.id === selectedChannelId)?.name ?? "Channel"}
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {!selectedChannelId && (
              <div className="flex items-center justify-center pt-16">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-text-muted opacity-30" />
                  <p className="mt-3 text-sm text-text-muted">Select a channel</p>
                </div>
              </div>
            )}
            {selectedChannelId && channelThreads.isLoading && (
              <div className="flex items-center justify-center pt-16">
                <Loader2 className="h-6 w-6 animate-spin text-neon-pink" />
              </div>
            )}
            {selectedChannelId && !channelThreads.isLoading && (channelThreads.data?.length ?? 0) === 0 && (
              <div className="flex items-center justify-center pt-16">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-text-muted opacity-30" />
                  <p className="mt-3 text-sm text-text-muted">No threads yet</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Click "Sync" to fetch the latest activity
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {channelThreads.data?.map((thread, i) => (
                <div key={thread.id} className={cn("animate-glass-in", `stagger-${Math.min(i + 1, 5)}`)}>
                  <ThreadCard
                    thread={thread}
                    slackChannelId={selectedChannel?.slackChannelId}
                    domain={selectedChannel ? workspaceDomains.get(selectedChannel.teamId ?? "") : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const slackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slack",
  component: SlackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    channel: (search.channel as string) ?? undefined,
  }),
});
