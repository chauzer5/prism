import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { mkdirSync } from "node:fs";

const VSCODE_PORT = 8767;
const VSCODE_DATA_DIR = path.join(process.cwd(), "data", "vscode");

// Ensure the persistent data directory exists
mkdirSync(VSCODE_DATA_DIR, { recursive: true });

let proc: ChildProcess | null = null;
let status: "stopped" | "starting" | "running" | "error" = "stopped";
let lastError: string | null = null;

export function getVSCodeStatus() {
  return { status, port: VSCODE_PORT, lastError };
}

export async function startVSCode(): Promise<{ status: string; port: number }> {
  if (proc && status === "running") {
    return { status: "running", port: VSCODE_PORT };
  }

  // Kill any leftover process
  if (proc) {
    proc.kill();
    proc = null;
  }

  status = "starting";
  lastError = null;

  return new Promise((resolve) => {
    proc = spawn("code", [
      "serve-web",
      "--port", String(VSCODE_PORT),
      "--host", "127.0.0.1",
      "--without-connection-token",
      "--accept-server-license-terms",
      "--user-data-dir", VSCODE_DATA_DIR,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;

    const onData = (data: Buffer) => {
      const text = data.toString();
      // VS Code prints "Web UI available at http://..." when ready
      if (!resolved && text.includes("http")) {
        resolved = true;
        status = "running";
        resolve({ status: "running", port: VSCODE_PORT });
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", (err) => {
      status = "error";
      lastError = err.message;
      proc = null;
      if (!resolved) {
        resolved = true;
        resolve({ status: "error", port: VSCODE_PORT });
      }
    });

    proc.on("close", (code) => {
      if (status !== "error") {
        status = "stopped";
      }
      proc = null;
      if (!resolved) {
        resolved = true;
        resolve({ status: "stopped", port: VSCODE_PORT });
      }
    });

    // Timeout — if it doesn't print the URL in 15s, assume it's running anyway
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (proc && !proc.killed) {
          status = "running";
          resolve({ status: "running", port: VSCODE_PORT });
        } else {
          status = "error";
          lastError = "Timed out waiting for VS Code to start";
          resolve({ status: "error", port: VSCODE_PORT });
        }
      }
    }, 15_000);
  });
}

export function stopVSCode() {
  if (proc) {
    proc.kill();
    proc = null;
  }
  status = "stopped";
  lastError = null;
}
