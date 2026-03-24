import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import * as pty from "node-pty";
import { broadcast } from "../ws/events.js";

const KILL_TIMEOUT_MS = 5000;
const IDLE_TIMEOUT_MS = 10_000;
const PID_POLL_INTERVAL_MS = 3000;

// Matches Claude Code's working spinner, e.g. "\r✽Recombobulating…"
// eslint-disable-next-line no-control-regex
const BUSY_PATTERN = /\r[·✢✳✶✻✽]?[A-Z][a-z]+(?:\.\.\.|\u2026)/;

function stripAnsi(str: string): string {
  return str
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[?>=!]?[0-9;]*[a-zA-Z~]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[^[\]]/g, "");
}

let currentPty: pty.IPty | null = null;
let currentId: string | null = null;
let pendingSpawn: { command: string; args: string[]; cwd: string } | null = null;

let activityState: "idle" | "busy" | "not_running" = "not_running";
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function updateActivity(data: string): void {
  const clean = stripAnsi(data);

  // Spinner pattern triggers idle → busy
  if (activityState !== "busy" && BUSY_PATTERN.test(clean)) {
    activityState = "busy";
  }

  // Any output while busy resets the idle timer
  if (activityState === "busy") {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (activityState === "busy") {
        activityState = "idle";
      }
    }, IDLE_TIMEOUT_MS);
  }
}

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
    updateActivity(data);
    // Decouple broadcast from PTY read to prevent WebSocket backpressure
    // from stalling the PTY when the frontend tab is hidden
    setImmediate(() => broadcast({ type: "agent:stdout", agentId: id, data }));
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (currentId === id) {
      currentPty = null;
      currentId = null;
      activityState = "not_running";
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
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
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
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
  if (!currentPty && !externalPid) return "not_running";
  if (currentPty) return activityState;
  // External agent — we know it's running but can't detect busy/idle
  return externalActivity;
}

// ── External Terminal Agent ──────────────────────────────────────────

let externalPid: number | null = null;
let externalId: string | null = null;
let externalPollTimer: ReturnType<typeof setInterval> | null = null;
let externalActivity: "idle" | "busy" | "not_running" = "not_running";

const PID_DIR = path.join(os.tmpdir(), "prism-agents");

function ensurePidDir() {
  if (!fs.existsSync(PID_DIR)) {
    fs.mkdirSync(PID_DIR, { recursive: true });
  }
}

function pidFilePath(agentId: string): string {
  return path.join(PID_DIR, `${agentId}.pid`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startExternalPollLoop(agentId: string, pid: number) {
  stopExternalPollLoop();
  externalPollTimer = setInterval(() => {
    if (!isProcessAlive(pid)) {
      // Agent process exited
      externalPid = null;
      externalActivity = "not_running";
      stopExternalPollLoop();
      broadcast({ type: "agent:exit", agentId, code: 0 });
      // If this was the current agent, clear it
      if (externalId === agentId) {
        externalId = null;
      }
      // Clean up pid file
      try { fs.unlinkSync(pidFilePath(agentId)); } catch { /* ignore */ }
    }
  }, PID_POLL_INTERVAL_MS);
}

function stopExternalPollLoop() {
  if (externalPollTimer) {
    clearInterval(externalPollTimer);
    externalPollTimer = null;
  }
}

export function spawnExternalAgent(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ id: string }> {
  // Stop any existing agent
  if (currentId) stopAgent();
  if (externalId) stopExternalAgent();

  const id = randomUUID();
  ensurePidDir();
  const pidFile = pidFilePath(id);

  // Build the full command to run in Terminal.app
  const fullCmd = [command, ...args].map(a => {
    // Quote args that contain spaces
    if (a.includes(" ")) return `'${a.replace(/'/g, "'\\''")}'`;
    return a;
  }).join(" ");

  // Shell script that records PID and execs the agent
  // We use a subshell so Terminal.app shows the agent directly
  const script = `cd ${shellescape(cwd)} && echo $$ > ${shellescape(pidFile)} && exec ${fullCmd}`;

  return new Promise((resolve, reject) => {
    const osascript = `
      tell application "Terminal"
        activate
        do script ${JSON.stringify(script)}
      end tell
    `;

    exec(`osascript -e ${shellescape(osascript)}`, (err) => {
      if (err) {
        reject(new Error(`Failed to open Terminal.app: ${err.message}`));
        return;
      }

      // Wait briefly for the shell to write the PID file
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        try {
          const raw = fs.readFileSync(pidFile, "utf-8").trim();
          const pid = parseInt(raw, 10);
          if (!isNaN(pid) && pid > 0) {
            clearInterval(check);
            externalPid = pid;
            externalId = id;
            externalActivity = "busy";
            startExternalPollLoop(id, pid);
            resolve({ id });
          }
        } catch {
          // File not yet written
        }
        if (attempts > 20) {
          clearInterval(check);
          // PID file never appeared — agent may still be running but we can't track it
          externalId = id;
          externalActivity = "busy";
          resolve({ id });
        }
      }, 150);
    });
  });
}

export function stopExternalAgent(): boolean {
  if (!externalPid) {
    if (externalId) {
      const id = externalId;
      externalId = null;
      externalActivity = "not_running";
      stopExternalPollLoop();
      broadcast({ type: "agent:exit", agentId: id, code: null });
    }
    return true;
  }

  const id = externalId;
  try {
    process.kill(externalPid, "SIGTERM");
  } catch {
    // already dead
  }

  // Fallback SIGKILL
  const pid = externalPid;
  setTimeout(() => {
    try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
  }, KILL_TIMEOUT_MS);

  externalPid = null;
  externalId = null;
  externalActivity = "not_running";
  stopExternalPollLoop();

  if (id) {
    broadcast({ type: "agent:exit", agentId: id, code: null });
    try { fs.unlinkSync(pidFilePath(id)); } catch { /* ignore */ }
  }

  return true;
}

export function focusTerminal(): boolean {
  exec(`osascript -e 'tell application "Terminal" to activate'`);
  return true;
}

export function getExternalAgentId(): string | null {
  return externalId;
}

export function isExternalRunning(): boolean {
  return externalPid !== null || externalId !== null;
}

function shellescape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
