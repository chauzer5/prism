import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useEffect, useRef } from "react";
import {
  GitCompareArrows,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  AlertTriangle,
} from "lucide-react";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/ui/number-input";
import type { Workflow, WorkflowStep, ThinkingLevel } from "@prism/shared";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function WorkflowsPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [localWorkflows, setLocalWorkflows] = useState<Workflow[]>([]);

  const utils = trpc.useUtils();
  const workflowsQuery = trpc.agents.workflows.list.useQuery();
  const agentDefs = trpc.agents.workflows.agentDefs.useQuery();
  const modelsQuery = trpc.agents.listModels.useQuery();

  const saveMutation = trpc.agents.workflows.save.useMutation({
    onSuccess: () => utils.agents.workflows.list.invalidate(),
  });

  // Sync server data to local state
  useEffect(() => {
    if (workflowsQuery.data) {
      setLocalWorkflows(workflowsQuery.data);
    }
  }, [workflowsQuery.data]);

  // Auto-select first
  useEffect(() => {
    if (!selectedName && localWorkflows.length > 0) {
      setSelectedName(localWorkflows[0].name);
    }
  }, [selectedName, localWorkflows]);

  function persist(source?: Workflow[]) {
    const data = source ?? localWorkflows;
    saveMutation.mutate(data);
  }

  function handleCreateWorkflow() {
    const name = newWorkflowName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!name) return;
    if (localWorkflows.some((w) => w.name === name)) return;
    const updated = [
      ...localWorkflows,
      { name, description: "", steps: [] },
    ];
    setLocalWorkflows(updated);
    persist(updated);
    setShowNewWorkflow(false);
    setNewWorkflowName("");
    setSelectedName(name);
  }

  function handleDeleteWorkflow(name: string) {
    const updated = localWorkflows.filter((w) => w.name !== name);
    setLocalWorkflows(updated);
    persist(updated);
    if (selectedName === name) setSelectedName(null);
  }

  function updateWorkflow(name: string, patch: Partial<Workflow>) {
    const updated = localWorkflows.map((w) =>
      w.name === name ? { ...w, ...patch } : w
    );
    setLocalWorkflows(updated);
    persist(updated);
  }

  function renameWorkflow(oldName: string, newName: string) {
    const slug = newName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!slug || localWorkflows.some((w) => w.name === slug && w.name !== oldName)) return;
    const updated = localWorkflows.map((w) =>
      w.name === oldName ? { ...w, name: slug } : w
    );
    setLocalWorkflows(updated);
    persist(updated);
    if (selectedName === oldName) setSelectedName(slug);
  }

  const selectedWorkflow = localWorkflows.find((w) => w.name === selectedName);

  function shortModel(id: string): string {
    return id.replace(/^[^/]+\//, "").replace(/-\d{8}$/, "");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[2px] uppercase text-cream">
            Workflows
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">
            Manage agent workflow pipelines
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — workflow list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Workflows
            </div>
            <button
              onClick={() => setShowNewWorkflow(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {localWorkflows.map((wf, i) => (
              <div
                key={wf.name}
                className={cn(
                  "animate-glass-in group flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all",
                  `stagger-${Math.min(i + 1, 5)}`,
                  selectedName === wf.name
                    ? "bg-sidebar-accent text-cream shadow-[inset_0_0_0_1px_rgba(255,45,123,0.12)]"
                    : "text-text-secondary hover:bg-[rgba(255,45,123,0.04)]"
                )}
              >
                <button
                  onClick={() => setSelectedName(wf.name)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-neon-pink opacity-60" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{wf.name}</div>
                    <div className="truncate text-[11px] text-text-muted">
                      {wf.steps.length} {wf.steps.length === 1 ? "step" : "steps"}
                      {wf.description ? ` · ${wf.description}` : ""}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
                    {wf.steps.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteWorkflow(wf.name);
                    }}
                    className="rounded p-1 text-text-muted hover:text-red-400"
                    title="Delete workflow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {localWorkflows.length === 0 && !showNewWorkflow && (
              <p className="px-3 py-4 text-xs text-text-muted">
                No workflows yet. Create one to get started.
              </p>
            )}
          </div>

          {/* New workflow form */}
          {showNewWorkflow && (
            <div className="space-y-2 border-t border-border p-3">
              <input
                type="text"
                placeholder="Workflow name (e.g. plan-build-review)"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateWorkflow();
                  if (e.key === "Escape") {
                    setShowNewWorkflow(false);
                    setNewWorkflowName("");
                  }
                }}
                autoFocus
                className="w-full rounded-lg border border-border bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-xs text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateWorkflow}
                  disabled={!newWorkflowName.trim() || saveMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neon-pink-dark px-3 py-1.5 text-xs font-medium text-neon-pink-bright transition-all hover:bg-neon-pink disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewWorkflow(false);
                    setNewWorkflowName("");
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:border-border-hover hover:text-cream"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — workflow detail */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedWorkflow ? (
            <WorkflowDetail
              workflow={selectedWorkflow}
              agentDefs={agentDefs.data ?? []}
              models={modelsQuery.data ?? []}
              onUpdate={(patch) => updateWorkflow(selectedWorkflow.name, patch)}
              onRename={(newName) => renameWorkflow(selectedWorkflow.name, newName)}
              shortModel={shortModel}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <GitCompareArrows className="mx-auto h-12 w-12 text-text-muted opacity-40" />
                <p className="mt-3 text-sm text-text-muted">
                  Select a workflow to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow detail panel
// ---------------------------------------------------------------------------

function WorkflowDetail({
  workflow,
  agentDefs,
  models,
  onUpdate,
  onRename,
  shortModel,
}: {
  workflow: Workflow;
  agentDefs: { name: string; description: string }[];
  models: { provider: string; models: { id: string; name: string }[] }[];
  onUpdate: (patch: Partial<Workflow>) => void;
  onRename: (newName: string) => void;
  shortModel: (id: string) => string;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(workflow.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync name when workflow changes
  useEffect(() => {
    setNameValue(workflow.name);
    setEditingName(false);
  }, [workflow.name]);

  function commitName() {
    const slug = nameValue.trim().replace(/\s+/g, "-").toLowerCase();
    if (slug && slug !== workflow.name) {
      onRename(slug);
    }
    setEditingName(false);
  }

  function addStep() {
    const stepNames = workflow.steps.map((s) => s.name);
    let idx = workflow.steps.length + 1;
    let name = `step-${idx}`;
    while (stepNames.includes(name)) {
      idx++;
      name = `step-${idx}`;
    }
    onUpdate({
      steps: [
        ...workflow.steps,
        { name, agent: "", prompt: "$INPUT" },
      ],
    });
  }

  function updateStep(index: number, patch: Partial<WorkflowStep>) {
    const steps = workflow.steps.map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    onUpdate({ steps });
  }

  function removeStep(index: number) {
    onUpdate({ steps: workflow.steps.filter((_, i) => i !== index) });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const steps = [...workflow.steps];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    onUpdate({ steps });
  }

  return (
    <>
      {/* Workflow header */}
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-neon-pink" />
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameValue(workflow.name);
                  setEditingName(false);
                }
              }}
              onBlur={commitName}
              className="rounded border border-neon-pink/30 bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-sm font-semibold text-cream focus:outline-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setEditingName(true);
                setTimeout(() => nameInputRef.current?.focus(), 0);
              }}
              className="text-sm font-semibold text-cream hover:text-neon-pink"
              title="Click to rename"
            >
              {workflow.name}
            </button>
          )}
        </div>

        {/* Description + max_loops */}
        <div className="mt-2 flex items-center gap-4">
          <input
            type="text"
            value={workflow.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description..."
            className="flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-text-secondary placeholder:text-text-muted hover:border-border focus:border-neon-pink/30 focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-text-muted" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Max loops
            </span>
            <NumberInput
              value={workflow.max_loops}
              onChange={(v) => onUpdate({ max_loops: v })}
              min={1}
              max={20}
              placeholder="∞"
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Steps
            </span>
            <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-neon-pink">
              {workflow.steps.length}
            </span>
          </div>
          <button
            onClick={addStep}
            className="flex items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-[rgba(255,45,123,0.06)]"
          >
            <Plus className="h-3 w-3" />
            Add Step
          </button>
        </div>

        {/* Flow visualization */}
        {workflow.steps.length > 0 && (
          <div className="flex items-center gap-1 px-4 py-2.5">
            {workflow.steps.map((step, i) => (
              <div key={step.name} className="flex items-center gap-1">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    "bg-[rgba(255,45,123,0.12)] text-neon-pink"
                  )}
                >
                  {step.name}
                </span>
                {i < workflow.steps.length - 1 && (
                  <span className="text-[10px] text-text-muted">→</span>
                )}
              </div>
            ))}
            <span className="text-[10px] text-text-muted">→</span>
            <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-[10px] font-semibold text-green-400">
              done
            </span>
          </div>
        )}

        <div className="space-y-2 p-4">
          {workflow.steps.map((step, i) => (
            <StepCard
              key={`${workflow.name}-${i}`}
              step={step}
              index={i}
              total={workflow.steps.length}
              agentDefs={agentDefs}
              models={models}
              shortModel={shortModel}
              onUpdate={(patch) => updateStep(i, patch)}
              onRemove={() => removeStep(i)}
              onMove={(dir) => moveStep(i, dir)}
            />
          ))}

          {workflow.steps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8">
              <Play className="h-8 w-8 text-text-muted opacity-30" />
              <p className="mt-2 text-xs text-text-muted">
                No steps yet. Add a step to define this workflow.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

function StepCard({
  step,
  index,
  total,
  agentDefs,
  models,
  shortModel,
  onUpdate,
  onRemove,
  onMove,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  agentDefs: { name: string; description: string }[];
  models: { provider: string; models: { id: string; name: string }[] }[];
  shortModel: (id: string) => string;
  onUpdate: (patch: Partial<WorkflowStep>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={cn(
        "animate-glass-in group rounded-lg border border-[rgba(255,45,123,0.1)] bg-[rgba(255,45,123,0.05)] transition-all hover:border-[rgba(255,45,123,0.18)]",
        `stagger-${Math.min(index + 1, 5)}`
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-text-muted transition-colors hover:text-cream disabled:opacity-20"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-text-muted transition-colors hover:text-cream disabled:opacity-20"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <span className="rounded-full bg-[rgba(255,45,123,0.12)] px-2 py-0.5 text-[10px] font-bold text-neon-pink">
          {index + 1}
        </span>

        {/* Step name */}
        <input
          type="text"
          value={step.name}
          onChange={(e) =>
            onUpdate({ name: e.target.value.replace(/\s+/g, "-").toLowerCase() })
          }
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-cream hover:border-border focus:border-neon-pink/30 focus:outline-none"
          placeholder="step-name"
        />

        <button
          onClick={() => setExpanded((e) => !e)}
          className="rounded p-1 text-text-muted transition-colors hover:text-cream"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          onClick={onRemove}
          className="rounded p-1 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
          title="Remove step"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-3 border-t border-[rgba(255,45,123,0.06)] px-3 py-3">
          {/* Agent */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Agent
            </label>
            <select
              value={step.agent}
              onChange={(e) => onUpdate({ agent: e.target.value })}
              className="w-full rounded border border-border bg-[rgba(0,0,0,0.25)] px-2 py-1.5 text-xs text-cream focus:border-neon-pink/30 focus:outline-none"
            >
              <option value="">Select agent…</option>
              {agentDefs.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                  {d.description ? ` — ${d.description.slice(0, 60)}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Prompt
            </label>
            <textarea
              value={step.prompt}
              onChange={(e) => onUpdate({ prompt: e.target.value })}
              rows={3}
              placeholder="Prompt template. Use $INPUT, $ORIGINAL, $STEP, $ATTEMPT, $HISTORY..."
              className="w-full resize-y rounded border border-border bg-[rgba(0,0,0,0.25)] px-2 py-1.5 text-xs leading-relaxed text-cream placeholder:text-text-muted focus:border-neon-pink/30 focus:outline-none"
            />
          </div>

          {/* Model + Thinking row */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Model
              </label>
              <select
                value={step.model ?? ""}
                onChange={(e) =>
                  onUpdate({ model: e.target.value || undefined })
                }
                className="rounded border border-border bg-[rgba(0,0,0,0.25)] px-2 py-1 text-[11px] text-cream focus:border-neon-pink/30 focus:outline-none"
              >
                <option value="">Default</option>
                {models.map((provider) => (
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

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Thinking
              </label>
              <select
                value={step.thinking ?? ""}
                onChange={(e) =>
                  onUpdate({
                    thinking: (e.target.value || undefined) as
                      | ThinkingLevel
                      | undefined,
                  })
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
        </div>
      )}
    </div>
  );
}

export const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows",
  component: WorkflowsPage,
});
