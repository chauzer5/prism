import { db } from "../../db/index.js";
import { settings } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const GITHUB_BASE = "https://api.github.com";

async function getToken(): Promise<string> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "github.token"))
    .get();
  if (!row?.value) throw new Error("GitHub token not configured");
  return row.value;
}

async function getOrg(): Promise<string> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "github.org"))
    .get();
  if (!row?.value) throw new Error("GitHub organization not configured");
  return row.value;
}

async function githubFetch(path: string, token: string, init?: RequestInit) {
  const resp = await fetch(`${GITHUB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GitHub API ${resp.status}: ${body}`);
  }
  return resp.json();
}

// ── Types ──

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  avatar_url: string;
}

interface SearchResultItem {
  id: number;
  number: number;
  title: string;
  user: GitHubUser;
  state: string;
  draft?: boolean;
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: { url: string; html_url: string };
}

interface PRRaw {
  id: number;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  user: GitHubUser;
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  head: { ref: string; sha: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  mergeable: boolean | null;
  mergeable_state: string;
  changed_files: number;
  comments: number;
  body: string | null;
}

export interface PullRequest {
  id: number;
  number: number;
  repo: string;
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
  check_status: string | null;
  has_conflicts: boolean;
  comments_count: number;
}

export interface EnrichedPullRequest extends PullRequest {
  is_mine: boolean;
  is_team_member: boolean;
  needs_your_review: boolean;
  approved: boolean;
  you_are_mentioned: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface ReviewInfo {
  user: string;
  state: string;
  submitted_at: string;
}

export interface CommentInfo {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface PRDetail {
  number: number;
  repo: string;
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
  mergeable: boolean;
  mergeable_state: string;
  has_conflicts: boolean;
  changed_files: number;
  check_status: string | null;
  checks: CheckRun[];
  reviews: ReviewInfo[];
  comments: CommentInfo[];
  can_merge: boolean;
  created_at: string;
  updated_at: string;
}

// ── Org members ──

export interface GitHubMember {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function listOrgMembers(): Promise<GitHubMember[]> {
  const token = await getToken();
  const org = await getOrg();
  const members: { login: string; id: number; avatar_url: string }[] = await githubFetch(
    `/orgs/${org}/members?per_page=100`,
    token,
  );
  // Fetch full profile for each to get name/email
  const detailed = await Promise.allSettled(
    members.map(async (m) => {
      const user: GitHubUser & { email?: string | null } = await githubFetch(`/users/${m.login}`, token);
      return {
        id: m.id,
        login: m.login,
        name: user.name || m.login,
        email: user.email || null,
        avatar_url: m.avatar_url,
      } satisfies GitHubMember;
    }),
  );
  return detailed
    .filter((r): r is PromiseFulfilledResult<GitHubMember> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => (a.name ?? a.login).localeCompare(b.name ?? b.login));
}

// ── Helpers ──

function repoFromUrl(repositoryUrl: string): string {
  // "https://api.github.com/repos/owner/repo" → "owner/repo"
  return repositoryUrl.replace(`${GITHUB_BASE}/repos/`, "");
}

async function enrichPR(
  token: string,
  searchItem: SearchResultItem,
  username: string,
  teamNames: Set<string>,
): Promise<EnrichedPullRequest> {
  const repo = repoFromUrl(searchItem.repository_url);

  // Fetch full PR to get requested_reviewers, head sha, mergeable, etc.
  const pr: PRRaw = await githubFetch(`/repos/${repo}/pulls/${searchItem.number}`, token);

  const is_mine = pr.user.login.toLowerCase() === username.toLowerCase();
  const authorName = pr.user.name || pr.user.login;
  const is_team_member = !is_mine && teamNames.has(authorName);

  const needs_your_review = pr.requested_reviewers.some(
    (r) => r.login.toLowerCase() === username.toLowerCase(),
  );

  // Check mentions in comments
  let you_are_mentioned = false;
  try {
    const comments = await githubFetch(
      `/repos/${repo}/issues/${pr.number}/comments?per_page=50`,
      token,
    );
    const mentionPattern = `@${username}`;
    you_are_mentioned = comments.some(
      (c: { body: string }) => c.body.includes(mentionPattern),
    );
  } catch {
    // ignore
  }

  // Get combined commit status for check_status
  let check_status: string | null = null;
  try {
    const statusData = await githubFetch(
      `/repos/${repo}/commits/${pr.head.sha}/status`,
      token,
    );
    check_status = statusData.state === "pending" ? "pending" : statusData.state;
  } catch {
    // ignore
  }

  // Get approval status from reviews
  let approved = false;
  try {
    const reviews: { user: { login: string }; state: string }[] = await githubFetch(
      `/repos/${repo}/pulls/${pr.number}/reviews`,
      token,
    );
    // Keep only the latest review per user
    const latestByUser = new Map<string, string>();
    for (const r of reviews) {
      if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") {
        latestByUser.set(r.user.login, r.state);
      }
    }
    approved = latestByUser.size > 0 && [...latestByUser.values()].every((s) => s === "APPROVED");
  } catch {
    // ignore
  }

  return {
    id: pr.id,
    number: pr.number,
    repo,
    title: pr.title,
    draft: pr.draft,
    author: authorName,
    author_username: pr.user.login,
    author_avatar: pr.user.avatar_url,
    assignees: pr.assignees.map((a) => a.name || a.login),
    reviewers: pr.requested_reviewers.map((r) => r.name || r.login),
    source_branch: pr.head.ref,
    target_branch: pr.base.ref,
    web_url: pr.html_url,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    check_status,
    has_conflicts: pr.mergeable === false,
    comments_count: pr.comments,
    is_mine,
    is_team_member,
    needs_your_review,
    approved,
    you_are_mentioned,
  };
}

// ── Cache ──

let cachedPRs: EnrichedPullRequest[] = [];
let prCacheTime = 0;
const PR_CACHE_TTL = 60_000; // 60s

// ── Public API ──

export async function getPullRequests(): Promise<EnrichedPullRequest[]> {
  if (Date.now() - prCacheTime < PR_CACHE_TTL && cachedPRs.length > 0) {
    return cachedPRs;
  }

  const token = await getToken();
  const org = await getOrg();

  // Get current user
  const user: GitHubUser = await githubFetch("/user", token);

  // Search for open PRs in org
  const searchResults = await githubFetch(
    `/search/issues?q=is:pr+is:open+org:${encodeURIComponent(org)}&sort=updated&order=desc&per_page=50`,
    token,
  );
  const items: SearchResultItem[] = searchResults.items ?? [];

  // Fetch Linear team names for cross-referencing
  const teamNames = await getLinearTeamNames();

  // Enrich PRs concurrently (batch of 5)
  const enriched: EnrichedPullRequest[] = [];
  const batchSize = 5;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((item) => enrichPR(token, item, user.login, teamNames)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") enriched.push(r.value);
      else console.error("[github] Error enriching PR:", r.reason);
    }
  }

  // Sort: needs_your_review first, then by updated_at desc
  enriched.sort((a, b) => {
    if (a.needs_your_review !== b.needs_your_review) {
      return b.needs_your_review ? 1 : -1;
    }
    return b.updated_at.localeCompare(a.updated_at);
  });

  cachedPRs = enriched;
  prCacheTime = Date.now();

  return enriched;
}

export async function getPRDetail(repo: string, prNumber: number): Promise<PRDetail> {
  const token = await getToken();

  const [pr, reviewsRaw, comments] = await Promise.all([
    githubFetch(`/repos/${repo}/pulls/${prNumber}`, token) as Promise<PRRaw>,
    githubFetch(`/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`, token),
    githubFetch(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`, token),
  ]);

  // Get check runs
  let checks: CheckRun[] = [];
  let checkStatus: string | null = null;
  if (pr.head?.sha) {
    try {
      const checkData = await githubFetch(
        `/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=50`,
        token,
      );
      checks = (checkData.check_runs ?? []).map((cr: { id: number; name: string; status: string; conclusion: string | null }) => ({
        id: cr.id,
        name: cr.name,
        status: cr.status,
        conclusion: cr.conclusion,
      }));

      const statusData = await githubFetch(
        `/repos/${repo}/commits/${pr.head.sha}/status`,
        token,
      );
      checkStatus = statusData.state;
    } catch {
      // ignore
    }
  }

  // Determine latest review state per user (only most recent non-COMMENTED counts)
  const latestReviews = new Map<string, { state: string; submitted_at: string }>();
  for (const review of reviewsRaw) {
    if (review.state === "COMMENTED") continue;
    const login = review.user.login;
    const existing = latestReviews.get(login);
    if (!existing || new Date(review.submitted_at) > new Date(existing.submitted_at)) {
      latestReviews.set(login, { state: review.state, submitted_at: review.submitted_at });
    }
  }

  const checksOk = checks.length === 0 || checks.every(
    (c) =>
      c.status !== "completed" ||
      c.conclusion === "success" ||
      c.conclusion === "skipped" ||
      c.conclusion === "neutral",
  );

  const canMerge =
    pr.state === "open" &&
    !pr.draft &&
    pr.mergeable !== false &&
    checksOk;

  return {
    number: pr.number,
    repo,
    title: pr.title,
    description: pr.body ?? "",
    state: pr.state,
    draft: pr.draft,
    author: pr.user.name || pr.user.login,
    assignees: pr.assignees.map((a) => a.name || a.login),
    reviewers: pr.requested_reviewers.map((r) => r.name || r.login),
    source_branch: pr.head.ref,
    target_branch: pr.base.ref,
    web_url: pr.html_url,
    mergeable: pr.mergeable ?? true,
    mergeable_state: pr.mergeable_state ?? "",
    has_conflicts: pr.mergeable === false,
    changed_files: pr.changed_files,
    check_status: checkStatus,
    checks,
    reviews: Array.from(latestReviews.entries()).map(([user, r]) => ({
      user,
      state: r.state,
      submitted_at: r.submitted_at,
    })),
    comments: comments.map((c: { id: number; user: GitHubUser; body: string; created_at: string }) => ({
      id: c.id,
      author: c.user.name || c.user.login,
      body: c.body,
      created_at: c.created_at,
    })),
    can_merge: canMerge,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
  };
}

export async function mergePR(repo: string, prNumber: number): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(`${GITHUB_BASE}/repos/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Merge failed: ${body}`);
  }
  return true;
}

export async function addComment(repo: string, prNumber: number, body: string): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(`${GITHUB_BASE}/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  return resp.ok;
}

export async function rerunCheck(repo: string, checkRunId: number): Promise<boolean> {
  const token = await getToken();
  const resp = await fetch(
    `${GITHUB_BASE}/repos/${repo}/check-runs/${checkRunId}/rerequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Rerun failed: ${body}`);
  }
  return true;
}

export async function testConnection(): Promise<string> {
  const token = await getToken();
  const user: GitHubUser = await githubFetch("/user", token);
  return `${user.name || user.login} (${user.login})`;
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
