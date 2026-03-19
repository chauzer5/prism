import { db } from "../../db/index.js";
import { settings } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const GITLAB_BASE = "https://gitlab.com/api/v4";

async function getToken(): Promise<string> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "gitlab.pat"))
    .get();
  if (!row?.value) throw new Error("GitLab PAT not configured");
  return row.value;
}

async function getGroupId(): Promise<string> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "gitlab.groupId"))
    .get();
  return row?.value ?? "12742924";
}

async function gitlabFetch(path: string, token: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(`${GITLAB_BASE}${path}`, {
      ...init,
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (resp.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`GitLab API ${resp.status}: ${body}`);
    }
    return resp.json();
  }
}

// ── Types ──

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url?: string;
}

interface MergeRequestRaw {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  state: string;
  draft?: boolean;
  author: GitLabUser;
  assignees?: GitLabUser[];
  reviewers?: GitLabUser[];
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  merge_status?: string;
  has_conflicts?: boolean;
  head_pipeline?: { id: number; status: string };
  user_notes_count?: number;
}

export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  draft: boolean;
  author: string;
  author_username: string;
  author_avatar?: string;
  assignees: string[];
  reviewers: string[];
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  pipeline_status: string | null;
  has_conflicts: boolean;
  notes_count: number;
}

export interface EnrichedMergeRequest extends MergeRequest {
  is_mine: boolean;
  is_team_member: boolean;
  needs_your_approval: boolean;
  approval_rules_needing_you: string[];
  approved: boolean;
  you_are_mentioned: boolean;
}

interface ApprovalRule {
  id: number;
  name: string;
  rule_type: string;
  approvals_required: number;
  eligible_approvers: GitLabUser[];
  approved_by: GitLabUser[];
  approved: boolean;
}

interface MergeRequestNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  system: boolean;
}

export interface PipelineJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  allow_failure: boolean;
}

interface DiscussionRaw {
  id: string;
  notes: {
    id: number;
    body: string;
    author: GitLabUser;
    created_at: string;
    system: boolean;
    resolvable: boolean;
    resolved: boolean;
  }[];
}

export interface ApprovalRuleInfo {
  name: string;
  approved: boolean;
  approvals_required: number;
  approved_by: string[];
  rule_type: string;
}

export interface DiscussionThread {
  id: string;
  notes: ThreadNote[];
  resolved: boolean;
}

export interface ThreadNote {
  id: number;
  author: string;
  body: string;
  created_at: string;
  system: boolean;
}

export interface MRDetail {
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  draft: boolean;
  author: string;
  assignees: string[];
  reviewers: string[];
  source_branch: string;
  target_branch: string;
  web_url: string;
  merge_status: string;
  detailed_merge_status: string;
  has_conflicts: boolean;
  changes_count: string;
  discussions_resolved: boolean;
  pipeline_status: string | null;
  pipeline_id: number | null;
  jobs: PipelineJob[];
  approval_rules: ApprovalRuleInfo[];
  discussions: DiscussionThread[];
  can_merge: boolean;
  created_at: string;
  updated_at: string;
}

// ── Org members ──

export interface GitLabMember {
  id: number;
  name: string;
  username: string;
  email?: string;
  avatar_url?: string;
}

export async function listGroupMembers(): Promise<GitLabMember[]> {
  const token = await getToken();
  const groupId = await getGroupId();
  const members: GitLabMember[] = await gitlabFetch(
    `/groups/${groupId}/members/all?per_page=100`,
    token,
  );
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Helpers ──

function toMergeRequest(raw: MergeRequestRaw): MergeRequest {
  return {
    id: raw.id,
    iid: raw.iid,
    project_id: raw.project_id,
    title: raw.title,
    draft: raw.draft ?? false,
    author: raw.author.name,
    author_username: raw.author.username,
    author_avatar: raw.author.avatar_url,
    assignees: (raw.assignees ?? []).map((u) => u.name),
    reviewers: (raw.reviewers ?? []).map((u) => u.name),
    source_branch: raw.source_branch,
    target_branch: raw.target_branch,
    web_url: raw.web_url,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    pipeline_status: raw.head_pipeline?.status ?? null,
    has_conflicts: raw.has_conflicts ?? false,
    notes_count: raw.user_notes_count ?? 0,
  };
}

async function enrichMR(
  token: string,
  mr: MergeRequest,
  userId: number,
  username: string,
  teamNames: Set<string>,
): Promise<EnrichedMergeRequest> {
  const base = `/projects/${mr.project_id}/merge_requests/${mr.iid}`;

  // Fetch MR detail (for up-to-date pipeline status) and approval state
  const [mrDetail, approvalState] = await Promise.all([
    gitlabFetch(base, token) as Promise<MergeRequestRaw>,
    gitlabFetch(`${base}/approval_state`, token) as Promise<{ rules: ApprovalRule[] }>,
  ]);

  // Update pipeline status from the per-MR endpoint (group list endpoint may omit it)
  mr.pipeline_status = mrDetail.head_pipeline?.status ?? null;

  let needs_your_approval = false;
  const approval_rules_needing_you: string[] = [];

  const meaningfulRules = (approvalState.rules ?? []).filter(
    (r) => r.rule_type !== "any_approver" && r.rule_type !== "report_approver" && r.rule_type !== "code_owner",
  );
  const approved = meaningfulRules.length > 0
    ? meaningfulRules.every((r) => r.approved || r.approvals_required === 0)
    : (approvalState.rules ?? []).some((r) => (r.approved_by ?? []).length > 0);

  for (const rule of meaningfulRules) {
    if (rule.approved || rule.approvals_required === 0) continue;
    const isEligible = (rule.eligible_approvers ?? []).some((a) => a.id === userId);
    if (isEligible) {
      needs_your_approval = true;
      approval_rules_needing_you.push(rule.name);
    }
  }

  // Check mentions in notes
  const notes: MergeRequestNote[] = await gitlabFetch(
    `${base}/notes?per_page=50`,
    token,
  );
  const mentionPattern = `@${username}`;
  const you_are_mentioned = notes.some(
    (note) => !note.system && note.body.includes(mentionPattern),
  );

  const is_mine = mr.author_username.toLowerCase() === username.toLowerCase();
  const is_team_member = !is_mine && teamNames.has(mr.author);

  return {
    ...mr,
    is_mine,
    is_team_member,
    needs_your_approval,
    approval_rules_needing_you,
    approved,
    you_are_mentioned,
  };
}

// ── Cache ──

let cachedMRs: EnrichedMergeRequest[] = [];
let mrCacheTime = 0;
const MR_CACHE_TTL = 60_000; // 60s

// ── Public API ──

export async function getMergeRequests(): Promise<EnrichedMergeRequest[]> {
  if (Date.now() - mrCacheTime < MR_CACHE_TTL && cachedMRs.length > 0) {
    return cachedMRs;
  }

  const token = await getToken();
  const groupId = await getGroupId();

  // Get current user
  const user: GitLabUser = await gitlabFetch("/user", token);

  // Fetch open MRs
  const rawMRs: MergeRequestRaw[] = await gitlabFetch(
    `/groups/${groupId}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=50`,
    token,
  );
  const mrs = rawMRs.map(toMergeRequest);

  // Fetch team members from Linear (if configured)
  const teamNames = await getLinearTeamNames();

  // Enrich MRs concurrently (batch of 5)
  const enriched: EnrichedMergeRequest[] = [];
  const batchSize = 5;
  for (let i = 0; i < mrs.length; i += batchSize) {
    const batch = mrs.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((mr) => enrichMR(token, mr, user.id, user.username, teamNames)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") enriched.push(r.value);
      else console.error("[gitlab] Error enriching MR:", r.reason);
    }
  }

  // Sort: needs_your_approval first, then by updated_at desc
  enriched.sort((a, b) => {
    if (a.needs_your_approval !== b.needs_your_approval) {
      return b.needs_your_approval ? 1 : -1;
    }
    return b.updated_at.localeCompare(a.updated_at);
  });

  cachedMRs = enriched;
  mrCacheTime = Date.now();

  return enriched;
}

export async function getMRDetail(projectId: number, mrIid: number): Promise<MRDetail> {
  const token = await getToken();
  const base = `/projects/${projectId}/merge_requests/${mrIid}`;

  const [mrRaw, discussions, approvalState] = await Promise.all([
    gitlabFetch(base, token),
    gitlabFetch(`${base}/discussions?per_page=100`, token) as Promise<DiscussionRaw[]>,
    gitlabFetch(`${base}/approval_state`, token) as Promise<{ rules: ApprovalRule[] }>,
  ]);

  let jobs: PipelineJob[] = [];
  if (mrRaw.head_pipeline) {
    jobs = await gitlabFetch(
      `/projects/${projectId}/pipelines/${mrRaw.head_pipeline.id}/jobs?per_page=50`,
      token,
    ).catch(() => []);
  }

  const allApprovalsMet = (approvalState.rules ?? []).every(
    (r) => r.approved || r.approvals_required === 0,
  );
  const pipelineOk = mrRaw.head_pipeline
    ? mrRaw.head_pipeline.status === "success"
    : true;
  const canMerge =
    mrRaw.state === "opened" &&
    !(mrRaw.draft ?? false) &&
    !(mrRaw.has_conflicts ?? false) &&
    (mrRaw.blocking_discussions_resolved ?? true) &&
    allApprovalsMet &&
    pipelineOk;

  return {
    iid: mrRaw.iid,
    project_id: projectId,
    title: mrRaw.title,
    description: mrRaw.description ?? "",
    state: mrRaw.state,
    draft: mrRaw.draft ?? false,
    author: mrRaw.author.name,
    assignees: (mrRaw.assignees ?? []).map((u: GitLabUser) => u.name),
    reviewers: (mrRaw.reviewers ?? []).map((u: GitLabUser) => u.name),
    source_branch: mrRaw.source_branch,
    target_branch: mrRaw.target_branch,
    web_url: mrRaw.web_url,
    merge_status: mrRaw.merge_status ?? "",
    detailed_merge_status: mrRaw.detailed_merge_status ?? "",
    has_conflicts: mrRaw.has_conflicts ?? false,
    changes_count: mrRaw.changes_count ?? "0",
    discussions_resolved: mrRaw.blocking_discussions_resolved ?? true,
    pipeline_status: mrRaw.head_pipeline?.status ?? null,
    pipeline_id: mrRaw.head_pipeline?.id ?? null,
    jobs,
    approval_rules: (approvalState.rules ?? []).map((r) => ({
      name: r.name,
      approved: r.approved,
      approvals_required: r.approvals_required,
      approved_by: (r.approved_by ?? []).map((u) => u.name),
      rule_type: r.rule_type,
    })),
    discussions: discussions
      .filter((d) => d.notes.length > 0 && !d.notes[0].system)
      .map((d) => {
        const resolved =
          d.notes.some((n) => n.resolvable) &&
          d.notes.every((n) => !n.resolvable || n.resolved);
        return {
          id: d.id,
          notes: d.notes.map((n) => ({
            id: n.id,
            author: n.author.name,
            body: n.body,
            created_at: n.created_at,
            system: n.system,
          })),
          resolved,
        };
      }),
    can_merge: canMerge,
    created_at: mrRaw.created_at,
    updated_at: mrRaw.updated_at,
  };
}

export async function mergeMR(projectId: number, mrIid: number): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(
    `${GITLAB_BASE}/projects/${projectId}/merge_requests/${mrIid}/merge`,
    {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": token },
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Merge failed: ${body}`);
  }
  return true;
}

export async function addMRNote(projectId: number, mrIid: number, body: string): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(
    `${GITLAB_BASE}/projects/${projectId}/merge_requests/${mrIid}/notes`,
    {
      method: "POST",
      headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  return resp.ok;
}

export async function playJob(projectId: number, jobId: number): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(
    `${GITLAB_BASE}/projects/${projectId}/jobs/${jobId}/play`,
    {
      method: "POST",
      headers: { "PRIVATE-TOKEN": token },
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Play failed: ${body}`);
  }
  return true;
}

export async function retryJob(projectId: number, jobId: number): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(
    `${GITLAB_BASE}/projects/${projectId}/jobs/${jobId}/retry`,
    {
      method: "POST",
      headers: { "PRIVATE-TOKEN": token },
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Retry failed: ${body}`);
  }
  return true;
}

export async function testConnection(): Promise<string> {
  const token = await getToken();
  const user: GitLabUser = await gitlabFetch("/user", token);
  return `${user.name} (${user.username})`;
}

// Helper: get team member names from stored settings
async function getLinearTeamNames(): Promise<Set<string>> {
  try {
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "team.members"))
      .get();
    if (!row?.value) return new Set();
    const names: string[] = JSON.parse(row.value);
    return new Set(names);
  } catch {
    return new Set();
  }
}
