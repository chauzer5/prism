import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import type { PiSession } from "@prism/shared";

const SESSIONS_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");
const FIRST_MESSAGE_MAX_LEN = 200;

/**
 * Parse a single JSONL session file to extract metadata.
 * Reads line-by-line to avoid loading large files entirely into memory.
 */
async function parseSessionFile(
  filePath: string,
): Promise<PiSession | null> {
  try {
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let header: {
      type: string;
      id?: string;
      timestamp?: string;
      cwd?: string;
    } | null = null;
    let firstMessage = "";
    let messageCount = 0;
    let model: string | undefined;
    let thinkingLevel: string | undefined;
    let sessionName: string | undefined;
    let totalCost = 0;
    let lineIndex = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        if (lineIndex === 0) {
          // First line should be the session header
          if (entry.type !== "session") {
            stream.destroy();
            return null;
          }
          header = entry;
          lineIndex++;
          continue;
        }

        switch (entry.type) {
          case "model_change":
            if (!model && entry.provider && entry.modelId) {
              model = `${entry.provider}/${entry.modelId}`;
            }
            break;

          case "thinking_level_change":
            if (!thinkingLevel && entry.thinkingLevel) {
              thinkingLevel = entry.thinkingLevel;
            }
            break;

          case "message":
            messageCount++;
            if (
              !firstMessage &&
              entry.message?.role === "user"
            ) {
              // Extract text from user message content
              const content = entry.message.content;
              if (typeof content === "string") {
                firstMessage = content.slice(0, FIRST_MESSAGE_MAX_LEN);
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "text" && block.text) {
                    firstMessage = block.text.slice(0, FIRST_MESSAGE_MAX_LEN);
                    break;
                  }
                }
              }
            }
            // Accumulate cost from assistant messages
            if (
              entry.message?.role === "assistant" &&
              entry.message?.usage?.cost?.total != null
            ) {
              totalCost += entry.message.usage.cost.total;
            }
            break;

          case "session_info":
            // Take the latest session name
            if (entry.name) {
              sessionName = entry.name;
            }
            break;
        }
      } catch {
        // Skip malformed JSON lines
      }

      lineIndex++;
    }

    if (!header?.id) return null;

    return {
      id: header.id,
      path: filePath,
      cwd: header.cwd ?? "",
      name: sessionName,
      created: header.timestamp ?? stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      messageCount,
      firstMessage,
      model,
      thinkingLevel,
      totalCost: totalCost > 0 ? Math.round(totalCost * 10000) / 10000 : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Recursively collect all .jsonl file paths under a directory.
 */
function collectJsonlFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectJsonlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist or be unreadable
  }

  return results;
}

/** Prefixes that identify internal/automated sessions (slack summarizer, etc.) */
const INTERNAL_PREFIXES = [
  "Summarize this Slack channel activity",
  "Summarize this single Slack conversation",
  "Write a single-sentence headline",
];

function isInternalSession(firstMessage: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => firstMessage.startsWith(prefix));
}

/**
 * List all Pi sessions from ~/.pi/agent/sessions/ recursively.
 * Returns sessions sorted by modified date (newest first).
 */
export async function listSessions(options?: {
  /** Max sessions to return */
  limit?: number;
  /** Filter to sessions whose cwd matches this path */
  cwd?: string;
}): Promise<PiSession[]> {
  const limit = options?.limit ?? 200;

  // Collect all .jsonl files
  const files = collectJsonlFiles(SESSIONS_ROOT);

  // Sort by mtime descending before parsing (optimization: only parse newest)
  const filesWithMtime = files
    .map((f) => {
      try {
        return { path: f, mtime: fs.statSync(f).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((f): f is { path: string; mtime: number } => f !== null)
    .sort((a, b) => b.mtime - a.mtime);

  // Parse files up to a reasonable limit (parse more than needed to account for filtering + failures)
  const parseLimit = options?.cwd ? filesWithMtime.length : limit * 2;
  const toParse = filesWithMtime.slice(0, parseLimit);

  const sessions: PiSession[] = [];

  for (const file of toParse) {
    const session = await parseSessionFile(file.path);
    if (session) {
      if (options?.cwd && session.cwd !== options.cwd) continue;
      if (isInternalSession(session.firstMessage)) continue;
      sessions.push(session);
      if (sessions.length >= limit) break;
    }
  }

  // Already sorted by mtime from the file collection step
  return sessions;
}
