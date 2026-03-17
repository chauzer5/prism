import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect } from "react";
import {
  Settings,
  MessageSquare,
  GitMerge,
  LayoutList,
  Check,
  Loader2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  X,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { useSlackEnabled } from "@/hooks/useSlackEnabled";

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
  testMutation?: ReturnType<typeof trpc.gitlab.testConnection.useMutation> | ReturnType<typeof trpc.linear.testConnection.useMutation>;
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

function SettingsPage() {
  const [slackModel, setSlackModel] = useState("");
  const [saved, setSaved] = useState(false);
  const slack = useSlackEnabled();

  const currentModel = trpc.settings.get.useQuery({ key: "slack.summarizationModel" });
  const modelsQuery = trpc.agents.listModels.useQuery();

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const testGitlab = trpc.gitlab.testConnection.useMutation();
  const testLinear = trpc.linear.testConnection.useMutation();

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
          {/* GitLab section */}
          <section className="rounded-xl border border-border bg-[rgba(255,45,123,0.02)]">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <GitMerge className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">GitLab</h2>
            </div>
            <div className="space-y-5 p-5">
              <CredentialRow
                label="Personal Access Token"
                settingKey="gitlab.pat"
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                testMutation={testGitlab}
              />
              <CredentialRow
                label="Group ID"
                settingKey="gitlab.groupId"
                placeholder="12742924"
              />
            </div>
          </section>

          {/* Linear section */}
          <section className="rounded-xl border border-border bg-[rgba(255,45,123,0.02)]">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <LayoutList className="h-4 w-4 text-neon-pink" />
              <h2 className="text-sm font-semibold text-cream">Linear</h2>
            </div>
            <div className="space-y-5 p-5">
              <CredentialRow
                label="API Key"
                settingKey="linear.apiKey"
                placeholder="lin_api_xxxxxxxxxxxxxxxxxxxx"
                testMutation={testLinear}
              />
              <CredentialRow
                label="Team ID"
                settingKey="linear.teamId"
                placeholder="d097c0ee-3414-4d3e-9ff9-56017012a45a"
              />
            </div>
          </section>

          {/* Slack section */}
          <section className="rounded-xl border border-border bg-[rgba(255,45,123,0.02)]">
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
