import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as pty from "node-pty";
import { broadcast } from "../ws/events.js";

const KILL_TIMEOUT_MS = 5000;

let currentPty: pty.IPty | null = null;
let currentId: string | null = null;
let pendingSpawn: { command: string; args: string[]; cwd: string } | null = null;

// Agent activity state: "idle" (waiting for input), "busy" (working), "not_running"
// TODO: revisit activity detection — session file watching was unreliable
let activityState: "idle" | "busy" | "not_running" = "not_running";

export function createPendingAgent(
  command: string,
  args: string[] = [],
  cwd?: string,
): string {
  // Stop any existing agent first
  if (currentId) {
    stopAgent();
  }

  const id = randomUUID();
  currentId = id;
  pendingSpawn = { command, args, cwd: cwd ?? os.homedir() };

  return id;
}

export function startAgent(cols: number, rows: number): boolean {
  if (!pendingSpawn || !currentId) return false;
  if (currentPty) return false;

  const { command, args, cwd } = pendingSpawn;
  pendingSpawn = null;

  const env: Record<string, string> = {
    ...process.env,
    TERM: "xterm-256color",
  } as Record<string, string>;

  const ptyProcess = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env,
  });

  currentPty = ptyProcess;
  const id = currentId;

  activityState = "idle";

  ptyProcess.onData((data: string) => {
    broadcast({ type: "agent:stdout", agentId: id, data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (currentId === id) {
      currentPty = null;
      currentId = null;
      activityState = "not_running";
    }
    broadcast({ type: "agent:exit", agentId: id, code: exitCode });
  });

  return true;
}

export function resizeAgent(cols: number, rows: number): boolean {
  if (!currentPty) return false;
  try {
    currentPty.resize(cols, rows);
    return true;
  } catch {
    return false;
  }
}

export function redrawAgent(): boolean {
  if (!currentPty) return false;
  try {
    const cols = currentPty.cols;
    const rows = currentPty.rows;
    currentPty.resize(Math.max(cols - 1, 1), rows);
    currentPty.resize(cols, rows);
    return true;
  } catch {
    return false;
  }
}

export function stopAgent(): boolean {
  activityState = "not_running";
  if (!currentPty) {
    // Pending but not started — just clear
    if (currentId) {
      const id = currentId;
      currentId = null;
      pendingSpawn = null;
      broadcast({ type: "agent:exit", agentId: id, code: null });
    }
    return true;
  }

  const id = currentId;
  currentPty.kill("SIGTERM");

  const timer = setTimeout(() => {
    try {
      currentPty?.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, KILL_TIMEOUT_MS);

  const checkExit = setInterval(() => {
    if (!currentPty) {
      clearTimeout(timer);
      clearInterval(checkExit);
    }
  }, 200);
  setTimeout(() => clearInterval(checkExit), KILL_TIMEOUT_MS + 1000);

  if (id) {
    broadcast({ type: "agent:exit", agentId: id, code: null });
  }

  return true;
}

export function sendStdin(data: string): boolean {
  if (!currentPty) return false;
  currentPty.write(data);
  return true;
}

export function getAgentId(): string | null {
  return currentId;
}

export function isRunning(): boolean {
  return currentPty !== null;
}

export function getActivity(): "idle" | "busy" | "not_running" {
  if (!currentPty) return "not_running";
  return activityState;
}
