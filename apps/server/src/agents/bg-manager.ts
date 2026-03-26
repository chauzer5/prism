import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agents, agentMessages } from "../db/schema.js";
import { broadcast } from "../ws/events.js";

const KILL_TIMEOUT_MS = 5000;

interface BackgroundAgent {
  id: string;
  process: ChildProcess;
  sessionId: string | null;
  textBuffer: string;  // accumulates text until a structural boundary flushes it to DB
  lineBuffer: string;  // partial stdout line buffer
  lastToolName: string | null;  // tracks the most recent tool_use name
}

const running = new Map<string, BackgroundAgent>();

// ── Helpers ──────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function flushTextBuffer(agent: BackgroundAgent) {
  if (agent.textBuffer.length === 0) return;

  const text = agent.textBuffer;
  agent.textBuffer = "";

  const id = randomUUID();
  db.insert(agentMessages).values({
    id,
    agentId: agent.id,
    role: "assistant",
    content: text,
    createdAt: now(),
  }).run();
}

// No timed flush — text is only flushed to DB on structural boundaries
// (tool_use, assistant full message, result, process exit).
// Real-time display uses WebSocket streaming text in the frontend store.

function handleJsonLine(agent: BackgroundAgent, line: string) {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(line);
  } catch {
    return; // not JSON, skip
  }

  const msgType = json.type as string | undefined;

  // ── system init — extract session_id early ──
  if (msgType === "system") {
    const sessionId = json.session_id as string | undefined;
    if (sessionId) {
      agent.sessionId = sessionId;
      db.update(agents)
        .set({ sessionId, updatedAt: now() })
        .where(eq(agents.id, agent.id))
        .run();
    }
    return;
  }

  // ── stream_event — incremental text deltas (from --include-partial-messages) ──
  if (msgType === "stream_event") {
    const event = json.event as Record<string, unknown> | undefined;
    if (!event) return;

    if (event.type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      const text = delta?.text as string | undefined;
      if (text) {
        agent.textBuffer += text;
        // Don't flush to DB here — just broadcast for real-time streaming display
        broadcast({ type: "agent:text", agentId: agent.id, text });
      }
    }
    return;
  }

  // ── assistant turn — full message with text and/or tool_use blocks ──
  if (msgType === "assistant") {
    const message = json.message as Record<string, unknown> | undefined;
    if (!message) return;

    const content = message.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (block.type === "text") {
        const text = block.text as string;
        if (text) {
          // Only save if we haven't already captured this via stream_event deltas
          // (stream_event deltas arrive before the assistant message)
          // If textBuffer is empty, we didn't get deltas — save directly
          if (agent.textBuffer.length === 0) {
            agent.textBuffer = text;
            broadcast({ type: "agent:text", agentId: agent.id, text });
          }
          // Flush accumulated text as a complete assistant message
          flushTextBuffer(agent);
        }
      } else if (block.type === "tool_use") {
        flushTextBuffer(agent);

        const toolName = String(block.name || "unknown");
        agent.lastToolName = toolName;
        const input = block.input ? (typeof block.input === "string" ? block.input : JSON.stringify(block.input)) : "";

        db.insert(agentMessages).values({
          id: randomUUID(),
          agentId: agent.id,
          role: "tool_use",
          content: input,
          toolName,
          createdAt: now(),
        }).run();

        broadcast({ type: "agent:tool_use", agentId: agent.id, toolName, input });
      }
    }
    return;
  }

  // ── user turn (tool results) ──
  if (msgType === "user") {
    const message = json.message as Record<string, unknown> | undefined;
    if (!message) return;

    const content = message.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (block.type === "tool_result") {
        const raw = block.content;
        const resultContent = typeof raw === "string" ? raw : (raw ? JSON.stringify(raw) : "");
        const isError = !!block.is_error;

        // Truncate large tool results for storage
        const truncated = resultContent.length > 4000
          ? resultContent.slice(0, 4000) + "\n... (truncated)"
          : resultContent;

        db.insert(agentMessages).values({
          id: randomUUID(),
          agentId: agent.id,
          role: "tool_result",
          content: truncated,
          isError,
          createdAt: now(),
        }).run();

        broadcast({ type: "agent:tool_result", agentId: agent.id, content: truncated, isError });
      }
    }
    return;
  }

  // ── result — final event, contains session_id ──
  if (msgType === "result") {
    const sessionId = (json.session_id as string) || null;
    if (sessionId) {
      agent.sessionId = sessionId;
      db.update(agents)
        .set({ sessionId, updatedAt: now() })
        .where(eq(agents.id, agent.id))
        .run();
    }
    flushTextBuffer(agent);
    return;
  }
}

function attachStdoutParser(agent: BackgroundAgent) {
  const proc = agent.process;

  proc.stdout?.on("data", (chunk: Buffer) => {
    const str = chunk.toString();
    agent.lineBuffer += str;

    const lines = agent.lineBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    agent.lineBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) handleJsonLine(agent, trimmed);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    // Log stderr for debugging but don't broadcast
    const str = chunk.toString().trim();
    if (str) console.log(`[agent:${agent.id.slice(0, 8)}] stderr:`, str);
  });

  // Use 'close' instead of 'exit' — fires after stdio streams are fully drained
  proc.on("close", (code) => {
    // Process any remaining line buffer
    if (agent.lineBuffer.trim()) {
      handleJsonLine(agent, agent.lineBuffer.trim());
      agent.lineBuffer = "";
    }

    // Flush any remaining text
    flushTextBuffer(agent);

    const askedQuestion = agent.lastToolName === "AskUserQuestion";
    const status = code === 0 ? (askedQuestion ? "asked_question" : "completed") : "failed";
    db.update(agents)
      .set({ status, exitCode: code, pid: null, updatedAt: now() })
      .where(eq(agents.id, agent.id))
      .run();

    running.delete(agent.id);
    broadcast({ type: "agent:status", agentId: agent.id, status });
    console.log(`[agent:${agent.id.slice(0, 8)}] closed with code ${code}`);
  });

  proc.on("error", (err) => {
    console.error(`[agent:${agent.id.slice(0, 8)}] spawn error:`, err.message);
    db.update(agents)
      .set({ status: "failed", pid: null, updatedAt: now() })
      .where(eq(agents.id, agent.id))
      .run();
    running.delete(agent.id);
    broadcast({ type: "agent:status", agentId: agent.id, status: "failed" });
  });
}

// ── Public API ───────────────────────────────────────────────────────

export function spawnAgent(opts: {
  id: string;
  prompt?: string;
  model?: string;
  cwd: string;
}): void {
  const args = ["--print", "--output-format", "stream-json", "--dangerously-skip-permissions", "--verbose", "--include-partial-messages"];

  if (opts.model) {
    args.push("--model", opts.model);
  }

  if (opts.prompt) {
    args.push(opts.prompt);
  }

  const proc = spawn("claude", args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    detached: true, // create a process group so we can kill all children
  });

  const agent: BackgroundAgent = {
    id: opts.id,
    process: proc,
    sessionId: null,
    textBuffer: "",
    lineBuffer: "",
    lastToolName: null,
  };

  running.set(opts.id, agent);

  // Update DB with PID
  db.update(agents)
    .set({ pid: proc.pid ?? null, updatedAt: now() })
    .where(eq(agents.id, opts.id))
    .run();

  attachStdoutParser(agent);
}

export function resumeAgent(id: string, userMessage: string): boolean {
  const agent = running.get(id);
  if (agent) {
    // Agent still has a live process — shouldn't resume
    return false;
  }

  // Look up the agent in DB
  const row = db.select().from(agents).where(eq(agents.id, id)).get();
  if (!row || !row.sessionId) return false;
  if (row.status !== "completed" && row.status !== "waiting" && row.status !== "asked_question") return false;

  const args = [
    "--print", "--output-format", "stream-json",
    "--dangerously-skip-permissions", "--verbose", "--include-partial-messages",
    "--resume", row.sessionId,
    userMessage,
  ];

  const proc = spawn("claude", args, {
    cwd: row.cwd || process.env.HOME || "/",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    detached: true,
  });

  const newAgent: BackgroundAgent = {
    id,
    process: proc,
    sessionId: row.sessionId,
    textBuffer: "",
    lineBuffer: "",
    lastToolName: null,
  };

  running.set(id, newAgent);

  db.update(agents)
    .set({ status: "running", pid: proc.pid ?? null, exitCode: null, updatedAt: now() })
    .where(eq(agents.id, id))
    .run();

  broadcast({ type: "agent:status", agentId: id, status: "running" });
  attachStdoutParser(newAgent);

  return true;
}

export function stopAgent(id: string): boolean {
  const agent = running.get(id);
  if (!agent) return false;

  const pid = agent.process.pid;

  // Kill the entire process group (negative PID) to catch child processes
  try {
    if (pid) process.kill(-pid, "SIGTERM");
    else agent.process.kill("SIGTERM");
  } catch {
    // already dead
  }

  // Fallback SIGKILL after timeout
  setTimeout(() => {
    try {
      if (pid) process.kill(-pid, "SIGKILL");
    } catch {
      // already dead
    }
  }, KILL_TIMEOUT_MS);

  // Don't wait for exit handler — update status immediately
  db.update(agents)
    .set({ status: "stopped", updatedAt: now() })
    .where(eq(agents.id, id))
    .run();

  running.delete(id);
  broadcast({ type: "agent:status", agentId: id, status: "stopped" });

  return true;
}

export function removeAgent(id: string): boolean {
  // Auto-stop if still running
  if (running.has(id)) {
    stopAgent(id);
  }

  db.delete(agentMessages).where(eq(agentMessages.agentId, id)).run();
  db.delete(agents).where(eq(agents.id, id)).run();
  return true;
}

export function isAgentRunning(id: string): boolean {
  return running.has(id);
}

export function getRunningIds(): string[] {
  return Array.from(running.keys());
}

/**
 * On server startup, mark any agents that were "running" as "failed"
 * since their processes are gone.
 */
export function cleanupStaleAgents() {
  db.update(agents)
    .set({ status: "failed", pid: null, updatedAt: now() })
    .where(eq(agents.status, "running"))
    .run();
}
