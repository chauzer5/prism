import fs from "fs";
import path from "path";
import os from "os";
import type { Team, TeamMember, ThinkingLevel } from "@prism/shared";

const PI_AGENTS_DIR = path.join(os.homedir(), ".pi", "agent", "agents");

export interface TeamMemberEntry {
  name: string;
  model?: string;
  thinking?: ThinkingLevel;
}

const VALID_THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

// ---------------------------------------------------------------------------
// YAML parser — supports name, name: model, name: model@thinking, name: @thinking
// ---------------------------------------------------------------------------

function parseTeamsYaml(content: string): Record<string, TeamMemberEntry[]> {
  const teams: Record<string, TeamMemberEntry[]> = {};
  let currentTeam: string | null = null;

  for (const line of content.split("\n")) {
    const teamMatch = line.match(/^(\S[^:]*):$/);
    if (teamMatch) {
      currentTeam = teamMatch[1].trim();
      teams[currentTeam] = [];
      continue;
    }
    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch && currentTeam) {
      const value = itemMatch[1].trim();
      const colonIdx = value.indexOf(":");
      if (colonIdx > 0) {
        const name = value.slice(0, colonIdx).trim();
        const rest = value.slice(colonIdx + 1).trim();
        const atIdx = rest.lastIndexOf("@");
        if (atIdx >= 0) {
          const modelPart = rest.slice(0, atIdx).trim() || undefined;
          const thinkingPart = rest.slice(atIdx + 1).trim();
          const thinking = VALID_THINKING_LEVELS.includes(thinkingPart as ThinkingLevel)
            ? (thinkingPart as ThinkingLevel)
            : undefined;
          teams[currentTeam].push({ name, model: modelPart, thinking });
        } else {
          teams[currentTeam].push({ name, model: rest || undefined });
        }
      } else {
        teams[currentTeam].push({ name: value });
      }
    }
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Agent .md frontmatter parser
// ---------------------------------------------------------------------------

export interface AgentDef {
  name: string;
  description: string;
  tools: string;
  model?: string;
  /** All frontmatter fields (including name, description, tools, model, plus extras like color, skills) */
  frontmatter: Record<string, string>;
  /** Body text after the closing --- */
  body: string;
}

function parseAgentFile(filePath: string): AgentDef | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const frontmatterRaw = fmMatch[1];
    const body = content.slice(fmMatch[0].length).replace(/^\n+/, "");

    // Parse all frontmatter key: value pairs (simple single-line values + multi-line lists)
    const frontmatter: Record<string, string> = {};
    const lines = frontmatterRaw.split("\n");
    let currentKey: string | null = null;
    let currentValues: string[] = [];

    function flushKey() {
      if (currentKey && currentValues.length > 0) {
        frontmatter[currentKey] = currentValues.join("\n");
      }
      currentKey = null;
      currentValues = [];
    }

    for (const line of lines) {
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (kvMatch) {
        flushKey();
        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();
        if (value) {
          currentValues.push(value);
        }
      } else if (currentKey) {
        // Continuation line (e.g., list items under skills:)
        currentValues.push(line);
      }
    }
    flushKey();

    const fileName = path.basename(filePath, ".md");

    return {
      name: frontmatter.name || fileName,
      description: frontmatter.description || "",
      tools: frontmatter.tools || "read,grep,find,ls",
      model: frontmatter.model || undefined,
      frontmatter,
      body,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scan all agent .md files
// ---------------------------------------------------------------------------

function scanAgentDefs(): Map<string, AgentDef> {
  const defs = new Map<string, AgentDef>();

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const key = entry.name.replace(/\.md$/, "").toLowerCase();
        if (!defs.has(key)) {
          const def = parseAgentFile(path.join(dir, entry.name));
          if (def) defs.set(key, def);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        scanDir(path.join(dir, entry.name));
      }
    }
  }

  scanDir(PI_AGENTS_DIR);
  return defs;
}

// ---------------------------------------------------------------------------
// Public API — read
// ---------------------------------------------------------------------------

export function listTeams(): Team[] {
  const teamsYamlPath = path.join(PI_AGENTS_DIR, "teams.yaml");

  if (!fs.existsSync(teamsYamlPath)) {
    return [];
  }

  const content = fs.readFileSync(teamsYamlPath, "utf-8");
  const teamsMap = parseTeamsYaml(content);
  const agentDefs = scanAgentDefs();

  return Object.entries(teamsMap).map(([teamName, memberEntries]) => ({
    name: teamName,
    members: memberEntries.map((entry): TeamMember => {
      const def = agentDefs.get(entry.name.toLowerCase());
      return {
        name: entry.name,
        description: def?.description ?? "",
        tools: def?.tools ?? "read,grep,find,ls",
        baseModel: def?.model,
        modelOverride: entry.model,
        thinkingOverride: entry.thinking,
        model: entry.model || def?.model || undefined,
        thinking: entry.thinking,
      };
    }),
  }));
}

export function getAgentDefs(): AgentDef[] {
  return Array.from(scanAgentDefs().values());
}

export function readAgentMd(
  name: string
): { frontmatter: Record<string, string>; body: string } | null {
  const filePath = path.join(PI_AGENTS_DIR, `${name}.md`);
  const def = parseAgentFile(filePath);
  if (!def) return null;
  return { frontmatter: def.frontmatter, body: def.body };
}

// ---------------------------------------------------------------------------
// Public API — write
// ---------------------------------------------------------------------------

export function saveTeamsYaml(teams: Record<string, TeamMemberEntry[]>): void {
  const lines: string[] = [];
  for (const [teamName, members] of Object.entries(teams)) {
    lines.push(`${teamName}:`);
    for (const member of members) {
      let line = `  - ${member.name}`;
      if (member.model && member.thinking) {
        line += `: ${member.model}@${member.thinking}`;
      } else if (member.model) {
        line += `: ${member.model}`;
      } else if (member.thinking) {
        line += `: @${member.thinking}`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  const teamsYamlPath = path.join(PI_AGENTS_DIR, "teams.yaml");
  fs.writeFileSync(teamsYamlPath, lines.join("\n"), "utf-8");
}

export function saveAgentMd(
  name: string,
  frontmatter: {
    name: string;
    description: string;
    tools: string;
    model?: string;
    [key: string]: string | undefined;
  },
  body: string
): void {
  const fmLines: string[] = [];
  // Write known keys first in a stable order
  const orderedKeys = ["name", "description", "tools", "model"];
  const written = new Set<string>();

  for (const key of orderedKeys) {
    const value = frontmatter[key];
    if (value !== undefined && value !== "") {
      fmLines.push(`${key}: ${value}`);
      written.add(key);
    }
  }

  // Write any extra keys (color, skills, etc.) to preserve round-trips
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!written.has(key) && value !== undefined && value !== "") {
      // Multi-line values (e.g., skills list) are stored with embedded newlines
      if (value.includes("\n")) {
        fmLines.push(`${key}:`);
        for (const subLine of value.split("\n")) {
          fmLines.push(subLine);
        }
      } else {
        fmLines.push(`${key}: ${value}`);
      }
    }
  }

  const content = `---\n${fmLines.join("\n")}\n---\n${body}`;
  const filePath = path.join(PI_AGENTS_DIR, `${name}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
}

export function deleteAgentMd(name: string): boolean {
  const filePath = path.join(PI_AGENTS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
