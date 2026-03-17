import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect } from "react";
import { Users, Plus, Trash2, Bot, X } from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import type { Team, ThinkingLevel } from "@prism/shared";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function TeamsPage() {
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);

  // --- New team ---
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  // --- Add member ---
  const [addAgentSlug, setAddAgentSlug] = useState("");

  // --- Local teams state for override edits ---
  const [localTeams, setLocalTeams] = useState<Team[]>([]);

  const utils = trpc.useUtils();

  const teams = trpc.agents.teams.list.useQuery();
  const agentDefs = trpc.agents.teams.agentDefs.useQuery();
  const modelsQuery = trpc.agents.listModels.useQuery();

  // Sync server data into local state
  useEffect(() => {
    if (teams.data) {
      setLocalTeams(teams.data);
    }
  }, [teams.data]);

  // Auto-select first team if none selected
  useEffect(() => {
    if (!selectedTeamName && localTeams.length > 0) {
      setSelectedTeamName(localTeams[0].name);
    }
  }, [selectedTeamName, localTeams]);

  function invalidateAll() {
    utils.agents.teams.list.invalidate();
    utils.agents.teams.agentDefs.invalidate();
  }

  // --- Build the teams record from local state ---
  function buildTeamsRecord(source?: Team[]) {
    const data = source ?? localTeams;
    const record: Record<string, Array<{ name: string; model?: string; thinking?: string }>> = {};
    for (const team of data) {
      record[team.name] = team.members.map((m) => ({
        name: m.name,
        model: m.modelOverride || undefined,
        thinking: m.thinkingOverride || undefined,
      }));
    }
    return record;
  }

  const saveTeams = trpc.agents.teams.saveTeams.useMutation({
    onSuccess: () => invalidateAll(),
  });

  const selectedTeam = localTeams.find((t) => t.name === selectedTeamName);

  // Available agents not already in the selected team
  const availableAgents = (agentDefs.data ?? []).filter(
    (def) => !selectedTeam?.members.some((m) => m.name === def.name)
  );

  // --- Handlers ---

  function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    const record = buildTeamsRecord();
    record[name] = [];
    saveTeams.mutate(record, {
      onSuccess: () => {
        setShowNewTeam(false);
        setNewTeamName("");
        setSelectedTeamName(name);
      },
    });
  }

  function handleDeleteTeam(teamName: string) {
    const record = buildTeamsRecord();
    delete record[teamName];
    saveTeams.mutate(record, {
      onSuccess: () => {
        if (selectedTeamName === teamName) setSelectedTeamName(null);
      },
    });
  }

  function handleAddMember(agentSlug: string) {
    if (!selectedTeamName || !agentSlug) return;
    const record = buildTeamsRecord();
    if (!record[selectedTeamName]) return;
    if (record[selectedTeamName].some((m) => m.name === agentSlug)) return;
    record[selectedTeamName].push({ name: agentSlug });
    saveTeams.mutate(record, {
      onSuccess: () => setAddAgentSlug(""),
    });
  }

  function handleRemoveMember(memberName: string) {
    if (!selectedTeamName) return;
    const record = buildTeamsRecord();
    if (!record[selectedTeamName]) return;
    record[selectedTeamName] = record[selectedTeamName].filter(
      (m) => m.name !== memberName
    );
    saveTeams.mutate(record);
  }

  function handleModelChange(teamName: string, memberIndex: number, model: string) {
    const updated = localTeams.map((team) => {
      if (team.name !== teamName) return team;
      return {
        ...team,
        members: team.members.map((m, i) => {
          if (i !== memberIndex) return m;
          return { ...m, modelOverride: model || undefined, model: model || m.baseModel || undefined };
        }),
      };
    });
    setLocalTeams(updated);
    saveTeams.mutate(buildTeamsRecord(updated));
  }

  function handleThinkingChange(teamName: string, memberIndex: number, thinking: string) {
    const updated = localTeams.map((team) => {
      if (team.name !== teamName) return team;
      return {
        ...team,
        members: team.members.map((m, i) => {
          if (i !== memberIndex) return m;
          return {
            ...m,
            thinkingOverride: (thinking || undefined) as ThinkingLevel | undefined,
            thinking: (thinking || undefined) as ThinkingLevel | undefined,
          };
        }),
      };
    });
    setLocalTeams(updated);
    saveTeams.mutate(buildTeamsRecord(updated));
  }

  // --- Truncate model ID for display ---
  function shortModel(id: string): string {
    // Strip provider prefix (e.g. "anthropic/") and date suffix (-YYYYMMDD)
    return id.replace(/^[^/]+\//, "").replace(/-\d{8}$/, "");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">Teams</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Manage agent teams and their members
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — team list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Teams
            </div>
            <button
              onClick={() => setShowNewTeam(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]"
            >
              <Plus className="h-3 w-3" />
              New Team
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {localTeams.map((team, i) => (
              <div
                key={team.name}
                className={cn(
                  "animate-glass-in group flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all",
                  `stagger-${Math.min(i + 1, 5)}`,
                  selectedTeamName === team.name
                    ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                    : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]"
                )}
              >
                <button
                  onClick={() => setSelectedTeamName(team.name)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Users className="h-3.5 w-3.5 shrink-0 text-neon-pink opacity-60" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{team.name}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {team.members.length}{" "}
                      {team.members.length === 1 ? "member" : "members"}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                    {team.members.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTeam(team.name);
                    }}
                    className="rounded p-1 text-text-muted hover:text-red-400"
                    title="Delete team"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {localTeams.length === 0 && !showNewTeam && (
              <p className="px-3 py-4 text-xs text-text-muted">
                No teams yet. Create one to get started.
              </p>
            )}
          </div>

          {/* New team form */}
          {showNewTeam && (
            <div className="border-t border-border p-3 space-y-2">
              <input
                type="text"
                placeholder="Team name (e.g. plan-build)"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTeam();
                  if (e.key === "Escape") {
                    setShowNewTeam(false);
                    setNewTeamName("");
                  }
                }}
                autoFocus
                className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim() || saveTeams.isPending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewTeam(false);
                    setNewTeamName("");
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:border-border-hover hover:text-cream"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — team detail */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedTeam ? (
            <>
              {/* Team header */}
              <div className="border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-neon-pink" />
                  <span className="text-sm font-semibold text-cream">
                    {selectedTeam.name}
                  </span>
                </div>
              </div>

              {/* Members section */}
              <div className="flex-1 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Members
                    </span>
                    <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                      {selectedTeam.members.length}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {/* Member list */}
                  {selectedTeam.members.map((member, memberIdx) => (
                    <div
                      key={member.name}
                      className={cn(
                        "animate-glass-in group rounded-lg border border-[rgba(255,45,123,0.1)] bg-[rgba(255,45,123,0.05)] px-3 py-2.5 transition-all hover:border-[rgba(255,45,123,0.18)]",
                        `stagger-${Math.min(memberIdx + 1, 5)}`
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-neon-pink opacity-60" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Name row */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-cream">
                              {member.name}
                            </span>
                          </div>

                          {/* Description */}
                          {member.description && (
                            <p className="text-[11px] leading-relaxed text-text-secondary">
                              {member.description}
                            </p>
                          )}

                          {/* Model + Thinking selectors */}
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                                Model
                              </span>
                              <select
                                value={member.modelOverride ?? ""}
                                onChange={(e) =>
                                  handleModelChange(selectedTeam.name, memberIdx, e.target.value)
                                }
                                className="rounded border border-border bg-[rgba(0,0,0,0.25)] px-2 py-1 text-[11px] text-cream focus:border-neon-pink/30 focus:outline-none"
                              >
                                <option value="">
                                  {member.baseModel
                                    ? `Default (${shortModel(member.baseModel)})`
                                    : "Default"}
                                </option>
                                {modelsQuery.data?.map((provider) => (
                                  <optgroup key={provider.provider} label={provider.provider}>
                                    {provider.models.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                                Thinking
                              </span>
                              <select
                                value={member.thinkingOverride ?? ""}
                                onChange={(e) =>
                                  handleThinkingChange(selectedTeam.name, memberIdx, e.target.value)
                                }
                                className="rounded border border-border bg-[rgba(0,0,0,0.25)] px-2 py-1 text-[11px] text-cream focus:border-neon-pink/30 focus:outline-none"
                              >
                                <option value="">Default</option>
                                {THINKING_LEVELS.map((level) => (
                                  <option key={level} value={level}>
                                    {level}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Tools */}
                          <div className="flex flex-wrap gap-1">
                            {member.tools.split(",").map((tool) => (
                              <span
                                key={tool}
                                className="rounded bg-[rgba(255,45,123,0.08)] px-1.5 py-0.5 text-[10px] font-medium text-neon-pink"
                              >
                                {tool.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(member.name)}
                          className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                          title="Remove from team"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {selectedTeam.members.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Bot className="h-8 w-8 text-text-muted opacity-30" />
                      <p className="mt-2 text-xs text-text-muted">
                        No members yet. Add an agent below.
                      </p>
                    </div>
                  )}

                  {/* Add existing agent to team */}
                  <div className="mt-4 rounded-lg border border-border bg-[rgba(0,0,0,0.1)] p-3 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                      Add Agent to Team
                    </div>
                    {availableAgents.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          value={addAgentSlug}
                          onChange={(e) => setAddAgentSlug(e.target.value)}
                          className="flex-1 rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream focus:border-neon-pink/30 focus:outline-none"
                        >
                          <option value="">Select agent…</option>
                          {availableAgents.map((def) => (
                            <option key={def.name} value={def.name}>
                              {def.name}
                              {def.description ? ` — ${def.description.slice(0, 60)}` : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAddMember(addAgentSlug)}
                          disabled={!addAgentSlug || saveTeams.isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-text-muted">
                        All available agents are already in this team.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Users className="mx-auto h-12 w-12 text-text-muted opacity-40" />
                <p className="mt-3 text-sm text-text-muted">
                  Select a team to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teams",
  component: TeamsPage,
});
