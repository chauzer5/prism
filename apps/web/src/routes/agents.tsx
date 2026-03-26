import { createRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Plus,
  Bot,
  Loader2,
  Square,
  Trash2,
  Play,
  Pencil,
} from "lucide-react";
import { rootRoute } from "./__root";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAgentsStore } from "@/stores/agents";
import { AgentChat } from "@/components/AgentChat";
import { cn, timeAgo } from "@/lib/utils";

const STATUS_CONFIG = {
  running: {
    dot: "bg-neon-yellow shadow-[0_0_6px_rgba(250,204,21,0.5)] animate-pulse",
    label: "Running",
  },
  waiting: {
    dot: "bg-neon-green shadow-[0_0_6px_rgba(0,255,136,0.5)]",
    label: "Waiting",
  },
  asked_question: {
    dot: "bg-neon-cyan shadow-[0_0_6px_rgba(34,211,238,0.5)] animate-pulse",
    label: "Asked Question",
  },
  completed: {
    dot: "bg-neon-cyan/60",
    label: "Done",
  },
  failed: {
    dot: "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.4)]",
    label: "Failed",
  },
  stopped: {
    dot: "bg-text-muted/40",
    label: "Stopped",
  },
} as const;


function AgentNameEditor({
  agentId,
  name,
  onRenamed,
}: {
  agentId: string;
  name: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const rename = trpc.agents.rename.useMutation({
    onSuccess: () => {
      setEditing(false);
      onRenamed();
    },
  });

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function handleSave() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      rename.mutate({ id: agentId, name: trimmed });
    } else {
      setValue(name);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
        className="truncate text-sm font-semibold text-cream bg-transparent border-b border-neon-pink/50 outline-none py-0.5 w-full max-w-xs"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 truncate text-sm font-semibold text-cream hover:text-neon-pink transition-colors"
      title="Click to rename"
    >
      <span className="truncate">{name}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

function AgentsPage() {
  const [showNewForm, setShowNewForm] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");

  const selectedAgentId = useAgentsStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useAgentsStore((s) => s.setSelectedAgentId);

  const agentsQuery = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const spawnAgent = trpc.agents.spawn.useMutation({
    onSuccess: (data) => {
      setShowNewForm(false);
      setPrompt("");
      setName("");
      setSelectedAgentId(data.id);
      agentsQuery.refetch();
    },
  });

  const stopAgent = trpc.agents.stop.useMutation({
    onSuccess: () => agentsQuery.refetch(),
  });

  const removeAgent = trpc.agents.remove.useMutation({
    onSuccess: (_, vars) => {
      if (selectedAgentId === vars.id) setSelectedAgentId(null);
      agentsQuery.refetch();
    },
  });

  // Listen for status changes to refresh the list
  const onWsEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === "agent:status") {
        agentsQuery.refetch();
      }
    },
    [agentsQuery],
  );
  useWebSocket(onWsEvent);

  const agentsList = agentsQuery.data ?? [];
  const selectedAgent = agentsList.find((a) => a.id === selectedAgentId);

  function handleSpawn() {
    spawnAgent.mutate({
      prompt: prompt.trim() || undefined,
      name: name.trim() || undefined,
    });
  }

  return (
    <div className="flex h-full">
      {/* Left pane — agent list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-bold tracking-wider uppercase text-cream">
            Agents
          </h2>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="rounded-lg bg-neon-pink/15 p-1.5 text-neon-pink transition-colors hover:bg-neon-pink/25"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* New agent form */}
        {showNewForm && (
          <div className="border-b border-border p-3 space-y-2">
            <input
              type="text"
              placeholder="Agent name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-2.5 py-1.5 text-xs text-cream placeholder:text-text-muted/50 focus:border-neon-pink/50 focus:outline-none"
            />
            <textarea
              placeholder="What should the agent do?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-2.5 py-1.5 text-xs text-cream placeholder:text-text-muted/50 focus:border-neon-pink/50 focus:outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) {
                  e.preventDefault();
                  handleSpawn();
                }
              }}
            />
            <button
              onClick={handleSpawn}
              disabled={spawnAgent.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neon-pink/20 py-1.5 text-xs font-medium text-neon-pink transition-colors hover:bg-neon-pink/30 disabled:opacity-50"
            >
              {spawnAgent.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Launch
            </button>
          </div>
        )}

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto">
          {agentsList.length === 0 && !agentsQuery.isLoading && (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-text-muted">
              <Bot className="h-8 w-8 opacity-30" />
              <p className="text-xs">No agents yet</p>
            </div>
          )}

          {agentsList.map((agent) => {
            const statusConf = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.stopped;
            const isSelected = selectedAgentId === agent.id;
            const isActive = agent.status === "running" || agent.status === "waiting" || agent.status === "asked_question";

            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={cn(
                  "group flex cursor-pointer items-start gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-[rgba(255,255,255,0.03)]",
                  isSelected && "bg-[rgba(255,45,123,0.06)] border-l-2 border-l-neon-pink",
                )}
              >
                <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", statusConf.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-cream">
                      {agent.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {timeAgo(agent.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-text-muted">{statusConf.label}</span>
                  </div>
                </div>

                {/* Actions (show on hover) */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopAgent.mutate({ id: agent.id });
                      }}
                      className="rounded p-1 text-text-muted hover:text-neon-pink"
                      title="Stop"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  )}
                  {!isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAgent.mutate({ id: agent.id });
                      }}
                      className="rounded p-1 text-text-muted hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right pane — chat or empty state */}
      <div className="flex flex-1 flex-col min-w-0">
        {selectedAgent ? (
          <>
            {/* Chat header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
              <div className="min-w-0">
                <AgentNameEditor
                  agentId={selectedAgent.id}
                  name={selectedAgent.name}
                  onRenamed={() => agentsQuery.refetch()}
                />
                <div className="flex items-center gap-2 mt-0.5">
                  <div className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    STATUS_CONFIG[selectedAgent.status as keyof typeof STATUS_CONFIG]?.dot ?? "bg-text-muted/40",
                  )} />
                  <span className="text-[10px] text-text-muted">
                    {STATUS_CONFIG[selectedAgent.status as keyof typeof STATUS_CONFIG]?.label ?? "Unknown"}
                  </span>
                  {selectedAgent.model && (
                    <>
                      <span className="text-[10px] text-text-muted">·</span>
                      <span className="text-[10px] text-text-muted font-mono">{selectedAgent.model}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(selectedAgent.status === "running" || selectedAgent.status === "waiting" || selectedAgent.status === "asked_question") && (
                  <button
                    onClick={() => stopAgent.mutate({ id: selectedAgent.id })}
                    className="rounded-lg bg-[rgba(255,45,123,0.1)] px-3 py-1.5 text-xs font-medium text-neon-pink transition-colors hover:bg-[rgba(255,45,123,0.2)]"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            {/* Chat body */}
            <AgentChat agentId={selectedAgent.id} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
            <Bot className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select an agent or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});
