import { db } from "../../db/index.js";
import { settings } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const LINEAR_API = "https://api.linear.app/graphql";

async function getApiKey(): Promise<string> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "linear.apiKey"))
    .get();
  if (!row?.value) throw new Error("Linear API key not configured");
  return row.value;
}


async function linearQuery<T>(apiKey: string, query: string): Promise<T> {
  const resp = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const json = await resp.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

// ── Types ──

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  status_type: string;
  priority: number;
  assignee: string | null;
  assignee_is_me: boolean;
  assignee_is_team: boolean;
  team_key: string;
  team_name: string;
  labels: string[];
  url: string;
  updated_at: string;
  created_at: string;
}

export interface IssueComment {
  author: string;
  body: string;
  created_at: string;
}

export interface LinearIssueDetail {
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  status_type: string;
  priority: number;
  assignee: string | null;
  team_key: string;
  labels: string[];
  url: string;
  comments: IssueComment[];
  updated_at: string;
}

// ── Raw GraphQL types ──

interface IssueRaw {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  state: { name: string; type: string };
  assignee: { id: string; name: string } | null;
  team: { key: string; name: string };
  labels: { nodes: { name: string }[] };
  updatedAt: string;
  createdAt: string;
}

interface IssueDetailRaw extends IssueRaw {
  description: string | null;
  comments: {
    nodes: { body: string; createdAt: string; user: { name: string } }[];
  };
}

// ── Cache ──

let cachedIssues: LinearIssue[] = [];
let issuesCacheTime = 0;
let cachedReadyIssues: LinearIssue[] = [];
let readyIssuesCacheTime = 0;
const LINEAR_CACHE_TTL = 60_000; // 60s

// ── Public API ──

export async function getIssues(): Promise<LinearIssue[]> {
  if (Date.now() - issuesCacheTime < LINEAR_CACHE_TTL && cachedIssues.length > 0) {
    return cachedIssues;
  }

  const apiKey = await getApiKey();
  const teamMemberNames = new Set(await getTeamMembers());

  // Get viewer's assigned issues
  const myData = await linearQuery<{
    viewer: { assignedIssues: { nodes: IssueRaw[] } };
  }>(
    apiKey,
    `{
      viewer {
        assignedIssues(
          first: 50
          orderBy: updatedAt
          filter: { state: { type: { nin: ["completed", "canceled"] } } }
        ) {
          nodes {
            id identifier title priority url
            state { name type }
            assignee { id name }
            team { key name }
            labels { nodes { name } }
            updatedAt createdAt
          }
        }
      }
    }`,
  );

  const myIssueIds = new Set(myData.viewer.assignedIssues.nodes.map((i) => i.id));

  // If team members are configured, also fetch their issues
  const allRaw: IssueRaw[] = [];
  const seen = new Set<string>();

  for (const issue of myData.viewer.assignedIssues.nodes) {
    if (!seen.has(issue.id)) {
      seen.add(issue.id);
      allRaw.push(issue);
    }
  }

  if (teamMemberNames.size > 0) {
    // Fetch all org issues that are open and assigned to team members
    const orgData = await linearQuery<{
      issues: { nodes: IssueRaw[] };
    }>(
      apiKey,
      `{
        issues(
          first: 100
          orderBy: updatedAt
          filter: {
            state: { type: { nin: ["completed", "canceled"] } }
            assignee: { name: { in: [${[...teamMemberNames].map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",")}] } }
          }
        ) {
          nodes {
            id identifier title priority url
            state { name type }
            assignee { id name }
            team { key name }
            labels { nodes { name } }
            updatedAt createdAt
          }
        }
      }`,
    );

    for (const issue of orgData.issues.nodes) {
      if (!seen.has(issue.id)) {
        seen.add(issue.id);
        allRaw.push(issue);
      }
    }
  }

  const result = allRaw.map((raw) => {
    const assigneeName = raw.assignee?.name ?? null;
    const assigneeIsMe = myIssueIds.has(raw.id);
    const assigneeIsTeam =
      !assigneeIsMe && !!assigneeName && teamMemberNames.has(assigneeName);

    return {
      id: raw.id,
      identifier: raw.identifier,
      title: raw.title,
      status: raw.state.name,
      status_type: raw.state.type,
      priority: raw.priority,
      assignee: assigneeName,
      assignee_is_me: assigneeIsMe,
      assignee_is_team: assigneeIsTeam,
      team_key: raw.team.key,
      team_name: raw.team.name,
      labels: raw.labels.nodes.map((l) => l.name),
      url: raw.url,
      updated_at: raw.updatedAt,
      created_at: raw.createdAt,
    };
  });

  cachedIssues = result;
  issuesCacheTime = Date.now();

  return result;
}

export async function getIssueDetail(identifier: string): Promise<LinearIssueDetail> {
  const apiKey = await getApiKey();

  const data = await linearQuery<{ issue: IssueDetailRaw }>(
    apiKey,
    `{
      issue(id: "${identifier}") {
        id identifier title description priority url
        state { name type }
        assignee { id name }
        team { key name }
        labels { nodes { name } }
        comments(first: 30, orderBy: createdAt) {
          nodes { body createdAt user { name } }
        }
        updatedAt createdAt
      }
    }`,
  );

  const raw = data.issue;
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description ?? "",
    status: raw.state.name,
    status_type: raw.state.type,
    priority: raw.priority,
    assignee: raw.assignee?.name ?? null,
    team_key: raw.team.key,
    labels: raw.labels.nodes.map((l) => l.name),
    url: raw.url,
    comments: raw.comments.nodes.map((c) => ({
      author: c.user.name,
      body: c.body,
      created_at: c.createdAt,
    })),
    updated_at: raw.updatedAt,
  };
}

export async function addComment(issueId: string, body: string): Promise<boolean> {
  const apiKey = await getApiKey();
  const escapedBody = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const data = await linearQuery<{
    commentCreate: { success: boolean };
  }>(
    apiKey,
    `mutation { commentCreate(input: { issueId: "${issueId}", body: "${escapedBody}" }) { success } }`,
  );
  return data.commentCreate.success;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  active: boolean;
}

export async function listOrgMembers(): Promise<OrgMember[]> {
  const apiKey = await getApiKey();
  const data = await linearQuery<{
    organization: { users: { nodes: { id: string; name: string; email: string; avatarUrl: string | null; active: boolean }[] } };
  }>(
    apiKey,
    `{ organization { users(first: 250) { nodes { id name email avatarUrl active } } } }`,
  );
  return data.organization.users.nodes
    .filter((u) => u.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamMembers(): Promise<string[]> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "team.members"))
    .get();
  if (!row?.value) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export async function listTeams(): Promise<LinearTeam[]> {
  const apiKey = await getApiKey();
  const data = await linearQuery<{
    teams: { nodes: { id: string; key: string; name: string }[] };
  }>(apiKey, `{ teams { nodes { id key name } } }`);
  return data.teams.nodes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getReadyIssues(): Promise<LinearIssue[]> {
  if (Date.now() - readyIssuesCacheTime < LINEAR_CACHE_TTL && cachedReadyIssues.length > 0) {
    return cachedReadyIssues;
  }

  const apiKey = await getApiKey();

  const teamIdRow = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "linear.readyTeamId"))
    .get();
  if (!teamIdRow?.value) return [];

  const teamId = teamIdRow.value;

  const data = await linearQuery<{
    team: { issues: { nodes: IssueRaw[] } };
  }>(
    apiKey,
    `{
      team(id: "${teamId}") {
        issues(
          first: 50
          orderBy: updatedAt
          filter: {
            state: { name: { eq: "Ready to Start" } }
            assignee: { null: true }
          }
        ) {
          nodes {
            id identifier title priority url
            state { name type }
            assignee { id name }
            team { key name }
            labels { nodes { name } }
            updatedAt createdAt
          }
        }
      }
    }`,
  );

  const result = data.team.issues.nodes.map((raw) => ({
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    status: raw.state.name,
    status_type: raw.state.type,
    priority: raw.priority,
    assignee: raw.assignee?.name ?? null,
    assignee_is_me: false,
    assignee_is_team: false,
    team_key: raw.team.key,
    team_name: raw.team.name,
    labels: raw.labels.nodes.map((l) => l.name),
    url: raw.url,
    updated_at: raw.updatedAt,
    created_at: raw.createdAt,
  }));

  cachedReadyIssues = result;
  readyIssuesCacheTime = Date.now();

  return result;
}

export async function testConnection(): Promise<string> {
  const apiKey = await getApiKey();
  const data = await linearQuery<{
    viewer: { name: string; email: string };
  }>(apiKey, "{ viewer { name email } }");
  return `${data.viewer.name} (${data.viewer.email})`;
}
