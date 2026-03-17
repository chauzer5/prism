import fs from "fs";
import path from "path";
import os from "os";
import type { Workflow, WorkflowStep, ThinkingLevel } from "@prism/shared";

const PI_AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents");
const WORKFLOW_FILE = path.join(PI_AGENTS_DIR, "agent-workflow.yaml");

const VALID_THINKING: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

// ---------------------------------------------------------------------------
// YAML parser — hand-rolled for the workflow format
// ---------------------------------------------------------------------------

interface RawStep {
  name?: string;
  agent?: string;
  prompt?: string;
  model?: string;
  thinking?: string;
}

interface RawWorkflow {
  description?: string;
  max_loops?: number;
  steps: RawStep[];
}

function parseWorkflowYaml(content: string): Record<string, RawWorkflow> {
  const workflows: Record<string, RawWorkflow> = {};
  let currentWorkflow: string | null = null;
  let currentStep: RawStep | null = null;
  let inSteps = false;
  // Track if we're accumulating a multi-line prompt
  let promptKey: string | null = null;

  const lines = content.split("\n");

  function flushStep() {
    if (currentStep && currentWorkflow) {
      workflows[currentWorkflow].steps.push(currentStep);
    }
    currentStep = null;
    promptKey = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip comments and blanks at top level
    if (/^\s*#/.test(trimmed) || trimmed === "") {
      // Blank line inside a prompt doesn't end it
      if (promptKey && currentStep && inSteps && line.match(/^\s{6,}/)) {
        (currentStep as any)[promptKey] += "\n";
      }
      continue;
    }

    // Top-level workflow key (no leading whitespace, ends with colon)
    const workflowMatch = trimmed.match(/^([a-zA-Z_][\w-]*):\s*$/);
    if (workflowMatch) {
      flushStep();
      currentWorkflow = workflowMatch[1];
      workflows[currentWorkflow] = { steps: [] };
      inSteps = false;
      promptKey = null;
      continue;
    }

    if (!currentWorkflow) continue;

    // Workflow-level keys (2-space indent)
    const wfKeyMatch = trimmed.match(/^\s{2}([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (wfKeyMatch && !inSteps) {
      const key = wfKeyMatch[1];
      const val = wfKeyMatch[2].replace(/^["']|["']$/g, "").trim();
      if (key === "description") workflows[currentWorkflow].description = val;
      if (key === "max_loops") workflows[currentWorkflow].max_loops = parseInt(val, 10) || undefined;
      if (key === "steps") {
        inSteps = true;
      }
      continue;
    }

    // "steps:" line
    if (trimmed.match(/^\s{2}steps:\s*$/)) {
      inSteps = true;
      continue;
    }

    if (!inSteps) continue;

    // Step list item start (4-space indent + dash)
    const stepItemMatch = trimmed.match(/^\s{4}-\s+(\w+):\s*(.*)$/);
    if (stepItemMatch) {
      flushStep();
      currentStep = {};
      const key = stepItemMatch[1];
      const val = stepItemMatch[2].replace(/^["']|["']$/g, "").trim();
      (currentStep as any)[key] = val;
      promptKey = null;
      continue;
    }

    // Step property (6-space indent)
    const stepPropMatch = trimmed.match(/^\s{6}(\w[\w_]*):\s*(.*)$/);
    if (stepPropMatch && currentStep) {
      const key = stepPropMatch[1];
      let val = stepPropMatch[2].trim();

      // Handle multi-line prompt (starts with quote)
      if (key === "prompt" && val.startsWith('"') && !val.endsWith('"')) {
        promptKey = key;
        (currentStep as any)[key] = val.slice(1); // strip opening quote
        continue;
      }
      // Strip surrounding quotes
      val = val.replace(/^["']|["']$/g, "");
      (currentStep as any)[key] = val;
      promptKey = null;
      continue;
    }

    // Multi-line prompt continuation
    if (promptKey && currentStep) {
      let val = trimmed.trim();
      if (val.endsWith('"')) {
        val = val.slice(0, -1); // strip closing quote
        (currentStep as any)[promptKey] += "\n" + val;
        promptKey = null;
      } else {
        (currentStep as any)[promptKey] += "\n" + val;
      }
      continue;
    }
  }

  flushStep();
  return workflows;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeWorkflowYaml(workflows: Record<string, RawWorkflow>): string {
  const lines: string[] = [];

  for (const [name, wf] of Object.entries(workflows)) {
    lines.push(`${name}:`);
    if (wf.description) {
      lines.push(`  description: "${wf.description}"`);
    }
    if (wf.max_loops !== undefined) {
      lines.push(`  max_loops: ${wf.max_loops}`);
    }
    lines.push(`  steps:`);

    for (const step of wf.steps) {
      lines.push(`    - name: ${step.name}`);
      if (step.agent) lines.push(`      agent: ${step.agent}`);
      if (step.model) lines.push(`      model: ${step.model}`);
      if (step.thinking) lines.push(`      thinking: ${step.thinking}`);
      if (step.prompt) {
        // Use quoted multi-line if prompt contains newlines
        if (step.prompt.includes("\n")) {
          lines.push(`      prompt: "${step.prompt.replace(/\n/g, "\\n")}"`);
        } else {
          lines.push(`      prompt: "${step.prompt}"`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listWorkflows(): Workflow[] {
  if (!fs.existsSync(WORKFLOW_FILE)) return [];

  const content = fs.readFileSync(WORKFLOW_FILE, "utf-8");
  const raw = parseWorkflowYaml(content);

  return Object.entries(raw).map(([name, wf]) => ({
    name,
    description: wf.description,
    max_loops: wf.max_loops,
    steps: wf.steps.map(
      (s): WorkflowStep => ({
        name: s.name ?? "",
        agent: s.agent ?? "",
        prompt: (s.prompt ?? "").replace(/\\n/g, "\n"),
        model: s.model,
        thinking: VALID_THINKING.includes(s.thinking as ThinkingLevel)
          ? (s.thinking as ThinkingLevel)
          : undefined,
      })
    ),
  }));
}

export interface SaveWorkflowInput {
  name: string;
  description?: string;
  max_loops?: number;
  steps: {
    name: string;
    agent: string;
    prompt: string;
    model?: string;
    thinking?: string;
  }[];
}

export function saveWorkflows(workflows: SaveWorkflowInput[]): void {
  const raw: Record<string, RawWorkflow> = {};
  for (const wf of workflows) {
    raw[wf.name] = {
      description: wf.description,
      max_loops: wf.max_loops,
      steps: wf.steps.map((s) => ({
        name: s.name,
        agent: s.agent,
        prompt: s.prompt,
        model: s.model || undefined,
        thinking: s.thinking || undefined,
      })),
    };
  }

  fs.mkdirSync(path.dirname(WORKFLOW_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_FILE, serializeWorkflowYaml(raw), "utf-8");
}
