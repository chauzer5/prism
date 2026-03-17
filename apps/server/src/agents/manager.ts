import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as pty from "node-pty";
import type { Agent } from "@prism/shared";
import { broadcast } from "../ws/events.js";
import { extensionArgs } from "./extensions.js";

const BUFFER_MAX_LINES = 500;
const KILL_TIMEOUT_MS = 5000;
const PTY_RAW_BUFFER_MAX = 512 * 1024; // 512KB

const SESSION_DIR = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "sessions",
  "prism"
);

interface OutputEntry {
  stream: "stdout" | "stderr" | "user";
  data: string;
  timestamp: string;
}

interface ManagedAgent {
  agent: Agent;
  process: ChildProcess | null;
  pty: pty.IPty | null;
  sessionFile: string;
  output: OutputEntry[];
  stdoutBuffer: string;
}

const agents = new Map<string, ManagedAgent>();

// ── Structured mode (existing behavior) ─────────────────────────────

export function createAgent(prompt: string, name?: string, team?: string): Agent {
  const id = randomUUID();
  const now = new Date().toISOString();

  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const sessionFile = path.join(SESSION_DIR, `agent-${id}.jsonl`);

  const agent: Agent = {
    id,
    name: name ?? `agent-${id.slice(0, 8)}`,
    command: "pi --mode json -p",
    status: "running",
    mode: "structured",
    createdAt: now,
    startedAt: now,
    prompt,
    team,
    sessionFile,
  };

  const managed: ManagedAgent = {
    agent,
    process: null,
    pty: null,
    sessionFile,
    output: [],
    stdoutBuffer: "",
  };

  agents.set(id, managed);
  appendOutput(managed, "user", prompt);
  spawnTurn(managed, prompt);

  broadcast({ type: "agent:status", agentId: id, status: "running" });
  return agent;
}

/**
 * Spawn a pi process for a single conversation turn.
 * Uses `pi --mode json -p --session <file> --no-extensions <prompt>`
 * The session file persists conversation history for multi-turn.
 */
function spawnTurn(managed: ManagedAgent, message: string) {
  const { agent } = managed;

  const args = [
    "--mode",
    "json",
    "-p",
    "--session",
    managed.sessionFile,
  ];

  if (managed.agent.team) {
    args.push(...extensionArgs(["agent-team.ts"]));
  } else {
    args.push(...extensionArgs(), "--tools", "read,bash,grep,find,ls,edit,write");
  }

  args.push(message);

  const env = managed.agent.team
    ? { ...process.env, PI_TEAM: managed.agent.team }
    : process.env;

  const proc = spawn("pi", args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: path.join(os.homedir(), "dev", "nectar"),
    env,
  });

  managed.process = proc;
  managed.stdoutBuffer = "";
  agent.pid = proc.pid;

  // Parse JSONL from stdout — one JSON object per line
  proc.stdout?.setEncoding("utf-8");
  proc.stdout?.on("data", (chunk: string) => {
    managed.stdoutBuffer += chunk;

    const lines = managed.stdoutBuffer.split("\n");
    managed.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      processJsonLine(managed, line);
    }
  });

  proc.stderr?.setEncoding("utf-8");
  proc.stderr?.on("data", (chunk: string) => {
    if (!chunk.trim()) return;
    appendOutput(managed, "stderr", chunk);
    broadcast({ type: "agent:stderr", agentId: agent.id, data: chunk });
  });

  proc.on("close", (code) => {
    // Flush remaining buffer
    if (managed.stdoutBuffer.trim()) {
      processJsonLine(managed, managed.stdoutBuffer);
      managed.stdoutBuffer = "";
    }

    managed.process = null;

    if (agent.status === "stopped") {
      // Explicitly stopped — stay stopped
      return;
    }

    // Turn finished — agent stays "running" (ready for follow-up)
    // Session file persists, so the next spawnTurn will resume context
    broadcast({
      type: "agent:stdout",
      agentId: agent.id,
      data: "\n",
    });
    appendOutput(managed, "stdout", "\n");
    broadcast({ type: "agent:turn_end", agentId: agent.id });
  });

  proc.on("error", (err) => {
    const data = `[spawn error] ${err.message}\n`;
    appendOutput(managed, "stderr", data);
    broadcast({ type: "agent:stderr", agentId: agent.id, data });
    agent.status = "error";
    managed.process = null;
    broadcast({ type: "agent:status", agentId: agent.id, status: "error" });
  });
}

/**
 * Parse a single JSONL line from pi --mode json output.
 *
 * Known event types:
 *   { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "..." } }
 *   { type: "tool_execution_start", ... }
 *   { type: "tool_execution_end", ... }
 *   { type: "message_start" | "message_end" | "turn_start" | "turn_end" | ... }
 */
function processJsonLine(managed: ManagedAgent, line: string) {
  const { agent } = managed;

  try {
    const event = JSON.parse(line);

    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      const text = event.assistantMessageEvent.delta ?? "";
      if (text) {
        appendOutput(managed, "stdout", text);
        broadcast({ type: "agent:stdout", agentId: agent.id, data: text });
      }
    } else if (event.type === "tool_execution_start") {
      const toolName = event.tool?.name ?? "tool";
      const info = `[${toolName}] `;
      appendOutput(managed, "stdout", info);
      broadcast({ type: "agent:stdout", agentId: agent.id, data: info });
    }
  } catch {
    // Not valid JSON — display raw
    const data = line + "\n";
    appendOutput(managed, "stdout", data);
    broadcast({ type: "agent:stdout", agentId: agent.id, data });
  }
}

// ── PTY mode ────────────────────────────────────────────────────────

export function createPtyAgent(
  command: string,
  args: string[] = [],
  options?: { name?: string; cols?: number; rows?: number; team?: string },
): Agent {
  const id = randomUUID();
  const now = new Date().toISOString();
  const cols = options?.cols ?? 80;
  const rows = options?.rows ?? 24;

  // Generate a session file for Pi commands so sessions are trackable
  const isPi = command.toLowerCase() === "pi";
  let sessionFile = "";
  if (isPi) {
    // Check if --session is already specified in args (e.g., when resuming a session)
    const hasSession = args.some((arg) => arg === "--session");
    if (hasSession) {
      // Use the provided session path for tracking
      const sessionIdx = args.indexOf("--session");
      sessionFile = sessionIdx >= 0 && sessionIdx + 1 < args.length ? args[sessionIdx + 1] : "";
    } else {
      // Generate a new session file for this agent
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      sessionFile = path.join(SESSION_DIR, `agent-${id}.jsonl`);
      args = ["--session", sessionFile, ...args];
    }
  }

  const env: Record<string, string> = {
    ...process.env,
    TERM: "xterm-256color",
  } as Record<string, string>;

  if (options?.team) {
    env.PI_TEAM = options.team;
  }

  // Spawn PTY first — if this throws, we don't leave a dangling agent in the map
  const ptyProcess = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: path.join(os.homedir(), "dev", "nectar"),
    env,
  });

  const agent: Agent = {
    id,
    name: options?.name ?? `pty-${id.slice(0, 8)}`,
    command: [command, ...args].join(" "),
    status: "running",
    mode: "pty",
    pid: ptyProcess.pid,
    createdAt: now,
    startedAt: now,
    prompt: "",
    team: options?.team,
    sessionFile: sessionFile || undefined,
  };

  const managed: ManagedAgent = {
    agent,
    process: null,
    pty: ptyProcess,
    sessionFile,
    output: [],
    stdoutBuffer: "",
  };

  agents.set(id, managed);

  ptyProcess.onData((data: string) => {
    appendOutput(managed, "stdout", data);
    broadcast({ type: "agent:stdout", agentId: agent.id, data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    managed.pty = null;
    agent.exitCode = exitCode;

    if (agent.status !== "stopped") {
      agent.status = "stopped";
    }

    broadcast({ type: "agent:exit", agentId: id, code: exitCode });
    broadcast({ type: "agent:status", agentId: id, status: "stopped" });
  });

  broadcast({ type: "agent:status", agentId: id, status: "running" });
  return agent;
}

export function resizeAgent(id: string, cols: number, rows: number): boolean {
  const managed = agents.get(id);
  if (!managed?.pty) return false;

  try {
    managed.pty.resize(cols, rows);
    return true;
  } catch {
    return false;
  }
}

// ── Shared operations ───────────────────────────────────────────────

export function stopAgent(id: string): boolean {
  const managed = agents.get(id);
  if (!managed) return false;

  managed.agent.status = "stopped";
  managed.agent.exitCode = null;

  if (managed.pty) {
    managed.pty.kill("SIGTERM");

    const timer = setTimeout(() => {
      try {
        managed.pty?.kill("SIGKILL");
      } catch {
        // Process already exited
      }
    }, KILL_TIMEOUT_MS);

    // Clear timeout when pty exits (handled by onExit callback)
    const checkExit = setInterval(() => {
      if (!managed.pty) {
        clearTimeout(timer);
        clearInterval(checkExit);
      }
    }, 200);
    setTimeout(() => clearInterval(checkExit), KILL_TIMEOUT_MS + 1000);
  } else if (managed.process) {
    managed.process.kill("SIGTERM");

    const timer = setTimeout(() => {
      try {
        managed.process?.kill("SIGKILL");
      } catch {
        // Process already exited
      }
    }, KILL_TIMEOUT_MS);

    managed.process.on("close", () => clearTimeout(timer));
  }

  broadcast({ type: "agent:exit", agentId: id, code: null });
  broadcast({ type: "agent:status", agentId: id, status: "stopped" });

  return true;
}

/**
 * Send stdin data to an agent.
 * PTY mode: writes raw data directly to the PTY.
 * Structured mode: spawns a new pi process for a follow-up turn.
 */
export function sendStdin(id: string, data: string): boolean {
  const managed = agents.get(id);
  if (
    !managed ||
    managed.agent.status === "stopped" ||
    managed.agent.status === "error"
  ) {
    return false;
  }

  // PTY mode: write raw data directly
  if (managed.agent.mode === "pty") {
    if (!managed.pty) return false;
    managed.pty.write(data);
    return true;
  }

  // Structured mode: can't send while a turn is in progress
  if (managed.process) {
    return false;
  }

  appendOutput(managed, "user", data);
  spawnTurn(managed, data);
  return true;
}

export function listAgents(): Agent[] {
  return Array.from(agents.values()).map((m) => m.agent);
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id)?.agent;
}

export function getAgentOutput(id: string): OutputEntry[] {
  return agents.get(id)?.output ?? [];
}

export function renameAgent(id: string, name: string): boolean {
  const managed = agents.get(id);
  if (!managed) return false;
  managed.agent.name = name;
  broadcast({ type: "agent:renamed", agentId: id, name });
  return true;
}

export function removeAgent(id: string): boolean {
  const managed = agents.get(id);
  if (!managed) return false;
  if (managed.process || managed.pty) return false;
  if (managed.agent.status === "running") return false;
  agents.delete(id);
  return true;
}

function appendOutput(
  managed: ManagedAgent,
  stream: "stdout" | "stderr" | "user",
  data: string
) {
  managed.output.push({ stream, data, timestamp: new Date().toISOString() });
  if (managed.output.length > BUFFER_MAX_LINES) {
    managed.output.splice(0, managed.output.length - BUFFER_MAX_LINES);
  }
}
