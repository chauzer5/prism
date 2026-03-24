import { useState, useCallback } from "react";
import { trpc } from "@/trpc";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Play,
  Square,
  ExternalLink,
  Terminal,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVITY_CONFIG = {
  not_running: {
    label: "Not running",
    dotClass: "bg-text-muted/40",
    textClass: "text-text-muted",
    glowClass: "",
  },
  busy: {
    label: "Working",
    dotClass:
      "bg-neon-yellow shadow-[0_0_8px_rgba(250,204,21,0.5)] animate-pulse",
    textClass: "text-neon-yellow",
    glowClass: "shadow-[0_0_20px_rgba(250,204,21,0.1)]",
  },
  idle: {
    label: "Waiting for input",
    dotClass: "bg-neon-green shadow-[0_0_8px_rgba(0,255,136,0.5)]",
    textClass: "text-neon-green",
    glowClass: "shadow-[0_0_20px_rgba(0,255,136,0.1)]",
  },
} as const;

export function AgentControl() {
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);

  const status = trpc.agents.status.useQuery(undefined, {
    refetchInterval: 2000,
    staleTime: 0,
  });

  const spawnExternal = trpc.agents.spawnExternal.useMutation({
    onSuccess: () => {
      setLaunching(false);
      setPrompt("");
      status.refetch();
    },
    onError: () => setLaunching(false),
  });

  const stop = trpc.agents.stop.useMutation({
    onSuccess: () => status.refetch(),
  });

  const focus = trpc.agents.focusTerminal.useMutation();

  // Listen for exit events to trigger refetch
  const onWsEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === "agent:exit") {
        status.refetch();
      }
    },
    [status],
  );
  useWebSocket(onWsEvent);

  const activity = status.data?.activity ?? "not_running";
  const isRunning = status.data?.running ?? false;
  const config = ACTIVITY_CONFIG[activity];

  function handleLaunch() {
    setLaunching(true);
    spawnExternal.mutate({
      prompt: prompt.trim() || undefined,
    });
  }

  function handleStop() {
    stop.mutate();
  }

  function handleFocus() {
    focus.mutate();
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 p-6">
      {/* Status Card */}
      <div
        className={cn(
          "glass glass-border-gradient rounded-2xl p-6 transition-shadow duration-500",
          config.glowClass,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn("h-3 w-3 rounded-full transition-all", config.dotClass)}
            />
            <div>
              <span className={cn("text-sm font-semibold", config.textClass)}>
                {config.label}
              </span>
              {isRunning && status.data?.mode === "external" && (
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Running in Terminal.app
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <>
                <button
                  onClick={handleFocus}
                  className="flex items-center gap-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-xs font-medium text-cream transition-colors hover:bg-[rgba(255,255,255,0.1)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Focus Terminal
                </button>
                <button
                  onClick={handleStop}
                  disabled={stop.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-[rgba(255,45,123,0.1)] px-3 py-1.5 text-xs font-medium text-neon-pink transition-colors hover:bg-[rgba(255,45,123,0.2)] disabled:opacity-50"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Launch Form — only when not running */}
      {!isRunning && (
        <div className="glass glass-border-gradient rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-cream">
            <Terminal className="h-4 w-4 text-neon-pink opacity-80" />
            Launch Agent
          </div>

          <div className="space-y-4">
            {/* Prompt */}
            <div>
              <label className="mb-1.5 block text-xs text-text-muted">
                Initial prompt (optional)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the agent work on?"
                rows={3}
                className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-2 text-sm text-cream placeholder:text-text-muted/50 focus:border-neon-pink/50 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    e.preventDefault();
                    handleLaunch();
                  }
                }}
              />
            </div>

            {/* Launch button */}
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-neon-pink/20 px-4 py-2.5 text-sm font-semibold text-neon-pink transition-all hover:bg-neon-pink/30 disabled:opacity-50"
            >
              {launching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening Terminal...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Launch in Terminal.app
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-text-muted/60">
              ⌘+Enter to launch &middot; Opens a real macOS terminal window
            </p>
          </div>
        </div>
      )}

      {/* Running agent info */}
      {isRunning && (
        <div className="glass glass-border-gradient rounded-2xl p-6">
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between text-text-muted">
              <span>Mode</span>
              <span className="font-mono text-cream">
                {status.data?.mode === "external" ? "External Terminal" : "Embedded PTY"}
              </span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>Agent ID</span>
              <span className="font-mono text-cream/60">
                {status.data?.id?.slice(0, 8)}...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
