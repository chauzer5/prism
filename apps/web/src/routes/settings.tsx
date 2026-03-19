import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect, useRef } from "react";
import {
  Settings,
  MessageSquare,
  GitMerge,
  LayoutList,
  CheckSquare,
  Bot,
  Check,
  Loader2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  X,
  Palette,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";
import { useTheme, type Theme } from "@/hooks/useTheme";

// ── Credential Row ──

function CredentialRow({
  label,
  settingKey,
  placeholder,
  testMutation,
}: {
  label: string;
  settingKey: string;
  placeholder: string;
  testMutation?: ReturnType<typeof trpc.sourceControl.testGitLab.useMutation> | ReturnType<typeof trpc.sourceControl.testGitHub.useMutation> | ReturnType<typeof trpc.linear.testConnection.useMutation>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const currentValue = trpc.settings.get.useQuery({ key: settingKey });
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      setEditing(false);
      setValue("");
      currentValue.refetch();
    },
  });

  const masked = currentValue.data
    ? currentValue.data.length <= 8
      ? "configured"
      : `${currentValue.data.slice(0, 6)}...${currentValue.data.slice(-4)}`
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-cream">{label}</label>
        <div className="flex items-center gap-2">
          {masked ? (
            <span className="flex items-center gap-1 text-[11px] text-neon-green">
              <Check className="h-3 w-3" />
              <span className="font-mono">{masked}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <AlertCircle className="h-3 w-3" />
              Not configured
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                setSetting.mutate({ key: settingKey, value: value.trim() });
              }
            }}
            autoFocus
            className="flex-1 rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-1.5 font-mono text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
          />
          <button
            onClick={() => setSetting.mutate({ key: settingKey, value: value.trim() })}
            disabled={setSetting.isPending || !value.trim()}
            className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
          >
            {setSetting.isPending ? "..." : "Save"}
          </button>
          <button
            onClick={() => { setEditing(false); setValue(""); }}
            className="rounded p-1 text-text-muted hover:text-cream"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] px-3 py-1.5 text-xs font-medium text-neon-purple transition-all hover:bg-[rgba(139,92,246,0.15)]"
          >
            {masked ? "Update" : "Configure"}
          </button>
          {masked && testMutation && (
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="rounded-lg border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.08)] px-3 py-1.5 text-xs font-medium text-neon-cyan transition-all hover:bg-[rgba(34,211,238,0.15)] disabled:opacity-50"
            >
              {testMutation.isPending ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Testing...
                </span>
              ) : (
                "Test Connection"
              )}
            </button>
          )}
        </div>
      )}

      {testMutation?.isSuccess && (
        <div className="flex items-center gap-1 text-[11px] text-neon-green">
          <Check className="h-3 w-3" />
          Connected: {testMutation.data}
        </div>
      )}
      {testMutation?.isError && (
        <div className="flex items-center gap-1 text-[11px] text-red-400">
          <AlertCircle className="h-3 w-3" />
          {testMutation.error.message}
        </div>
      )}
    </div>
  );
}

function AgentCwdSetting() {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentValue = trpc.settings.get.useQuery({ key: "agents.cwd" });
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      setEditing(false);
      setValue("");
      setShowSuggestions(false);
      currentValue.refetch();
    },
  });

  const dirsQuery = trpc.settings.listDirectories.useQuery(
    { prefix: value },
    { enabled: editing && value.length > 0 },
  );
  const suggestions = dirsQuery.data ?? [];

  useEffect(() => {
    setSelectedIdx(-1);
  }, [suggestions]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    if (showSuggestions) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSuggestions]);

  function selectDir(dir: string) {
    setValue(dir);
    setShowSuggestions(true);
    setSelectedIdx(-1);
  }

  function handleSave() {
    if (value.trim()) {
      setSetting.mutate({ key: "agents.cwd", value: value.trim() });
    }
  }

  const display = currentValue.data || "~ (home directory)";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-cream">Working Directory</label>
          <p className="mt-0.5 text-[11px] text-text-muted">
            The directory agents will run in when spawned
          </p>
        </div>
      </div>
      {editing ? (
        <div ref={wrapperRef} className="relative">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="/Users/you/projects"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => value.length > 0 && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
                    selectDir(suggestions[selectedIdx]);
                  } else {
                    handleSave();
                  }
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIdx((i) => Math.max(i - 1, -1));
                } else if (e.key === "Tab" && suggestions.length > 0) {
                  e.preventDefault();
                  const idx = selectedIdx >= 0 ? selectedIdx : 0;
                  selectDir(suggestions[idx] + "/");
                } else if (e.key === "Escape") {
                  setShowSuggestions(false);
                }
              }}
              autoFocus
              className="flex-1 rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-1.5 font-mono text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={setSetting.isPending || !value.trim()}
              className="rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
            >
              {setSetting.isPending ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(""); setShowSuggestions(false); }}
              className="rounded p-1 text-text-muted hover:text-cream"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-12 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
              {suggestions.map((dir, i) => (
                <button
                  key={dir}
                  onClick={() => selectDir(dir + "/")}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 font-mono text-xs text-left transition-colors",
                    i === selectedIdx
                      ? "bg-[rgba(255,45,123,0.08)] text-cream"
                      : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]",
                  )}
                >
                  {dir}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-secondary">{display}</span>
          <button
            onClick={() => {
              setValue(currentValue.data ?? "");
              setEditing(true);
            }}
            className="rounded-lg border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] px-3 py-1.5 text-xs font-medium text-neon-purple transition-all hover:bg-[rgba(139,92,246,0.15)]"
          >
            {currentValue.data ? "Change" : "Set"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsPage() {
  const [slackModel, setSlackModel] = useState("");
  const [saved, setSaved] = useState(false);
  const slack = useSlackEnabled();

  const currentModel = trpc.settings.get.useQuery({ key: "slack.summarizationModel" });
  const modelsQuery = {
    isLoading: false,
    data: [
      {
        provider: "Anthropic",
        models: [
          { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
          { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
        ],
      },
    ],
  };

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const { theme, setTheme } = useTheme();
  const testGitLab = trpc.sourceControl.testGitLab.useMutation();
  const testGitHub = trpc.sourceControl.testGitHub.useMutation();
  const testLinear = trpc.linear.testConnection.useMutation();

  const utils = trpc.useUtils();
  const scEnabled = trpc.settings.get.useQuery({ key: "sourceControl.enabled" });
  const sourceControlEnabled = scEnabled.data !== "false";
  const linearEnabled_ = trpc.settings.get.useQuery({ key: "linear.enabled" });
  const linearEnabled = linearEnabled_.data !== "false";
  const todosEnabled_ = trpc.settings.get.useQuery({ key: "todos.enabled" });
  const todosEnabled = todosEnabled_.data !== "false";
  const agentsEnabled_ = trpc.settings.get.useQuery({ key: "agents.enabled" });
  const agentsEnabled = agentsEnabled_.data !== "false";
  const toggleSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
    },
  });

  useEffect(() => {
    if (currentModel.data !== undefined) {
      setSlackModel(currentModel.data ?? "");
    }
  }, [currentModel.data]);

  function handleModelChange(value: string) {
    setSlackModel(value);
    setSetting.mutate({ key: "slack.summarizationModel", value });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Settings</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Configure integrations and preferences
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          {/* Theme section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <Palette className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Theme</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 p-5">
              {([
                {
                  key: "prismatic" as Theme,
                  label: "Prismatic",
                  desc: "Rainbow spectral, clean, iridescent",
                  preview: "bg-gradient-to-br from-[#a78bfa] via-[#67e8f9] to-[#c084fc]",
                },
                {
                  key: "cyberpunk" as Theme,
                  label: "Cyberpunk",
                  desc: "Neon pink, scanlines, grid floor",
                  preview: "bg-gradient-to-br from-[#ff2d7b] via-[#c026d3] to-[#00f0ff]",
                },
                {
                  key: "deep-space" as Theme,
                  label: "Deep Space",
                  desc: "Cool navy, starfield, minimal glow",
                  preview: "bg-gradient-to-br from-[#60a5fa] via-[#1e3a5f] to-[#22d3ee]",
                },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={cn(
                    "group relative rounded-lg border p-3 text-left transition-all",
                    theme === t.key
                      ? "border-neon-pink bg-[rgba(var(--color-primary),0.08)] shadow-[inset_0_0_0_1px_var(--color-neon-pink)]"
                      : "border-border hover:border-border-hover",
                  )}
                >
                  <div className={cn("mb-2.5 h-10 rounded-md", t.preview)} />
                  <div className="text-xs font-semibold text-cream">{t.label}</div>
                  <div className="mt-0.5 text-[10px] text-text-muted leading-snug">{t.desc}</div>
                  {theme === t.key && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-3.5 w-3.5 text-neon-pink" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Todos section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 px-5 py-3.5">
              <CheckSquare className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Todos</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {todosEnabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleSetting.mutate({ key: "todos.enabled", value: todosEnabled ? "false" : "true" })}
                  className="flex items-center text-text-muted transition-colors hover:text-cream"
                >
                  {todosEnabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Source Control section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <GitMerge className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Source Control</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {sourceControlEnabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleSetting.mutate({ key: "sourceControl.enabled", value: sourceControlEnabled ? "false" : "true" })}
                  className="flex items-center text-text-muted transition-colors hover:text-cream"
                >
                  {sourceControlEnabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <CredentialRow
                label="GitLab Personal Access Token"
                settingKey="gitlab.pat"
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                testMutation={testGitLab}
              />
              <div className="h-px bg-border" />
              <CredentialRow
                label="GitHub Access Token"
                settingKey="github.token"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                testMutation={testGitHub}
              />
            </div>
          </section>

          {/* Linear section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <LayoutList className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Linear</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {linearEnabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleSetting.mutate({ key: "linear.enabled", value: linearEnabled ? "false" : "true" })}
                  className="flex items-center text-text-muted transition-colors hover:text-cream"
                >
                  {linearEnabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <CredentialRow
                label="API Key"
                settingKey="linear.apiKey"
                placeholder="lin_api_xxxxxxxxxxxxxxxxxxxx"
                testMutation={testLinear}
              />
            </div>
          </section>

          {/* Slack section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <MessageSquare className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Slack</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {slack.enabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => slack.toggle(!slack.enabled)}
                  disabled={slack.isLoading || slack.isPending}
                  className="flex items-center text-text-muted transition-colors hover:text-cream disabled:opacity-50"
                  title={slack.enabled ? "Disable Slack" : "Enable Slack"}
                >
                  {slack.enabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              {/* Model selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-cream">
                      Summarization Model
                    </label>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Model used to summarize Slack conversations and generate headlines
                    </p>
                  </div>
                  {saved && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-neon-pink">
                      <Check className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {setSetting.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                  )}
                </div>

                <select
                  value={slackModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={modelsQuery.isLoading}
                  className={cn(
                    "w-full rounded-lg border border-border bg-[rgba(0,0,0,0.3)] px-3 py-2 font-mono text-xs text-cream transition-colors",
                    "focus:border-neon-pink focus:outline-none",
                    "disabled:opacity-50"
                  )}
                >
                  <option value="">Default model</option>
                  {modelsQuery.data?.map((provider) => (
                    <optgroup key={provider.provider} label={provider.provider}>
                      {provider.models.map((m) => (
                        <option key={`${provider.provider}/${m.id}`} value={`${provider.provider}/${m.id}`}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Agents section */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <Bot className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Agents</h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {agentsEnabled ? "Enabled" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleSetting.mutate({ key: "agents.enabled", value: agentsEnabled ? "false" : "true" })}
                  className="flex items-center text-text-muted transition-colors hover:text-cream"
                >
                  {agentsEnabled ? (
                    <ToggleRight className="h-5 w-5 text-neon-pink" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-5 p-5">
              <AgentCwdSetting />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});
