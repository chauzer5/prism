import { createNotification } from "../../notifications/create.js";
import { db } from "../../db/index.js";
import { settings, todos } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { broadcast } from "../../ws/events.js";
import {
  getMergeRequests as getGitLabMRs,
} from "../gitlab/client.js";
import {
  getPullRequests as getGitHubPRs,
} from "../github/client.js";

interface CachedState {
  pipelineStatus: string | null;
  approved: boolean;
}

const cache = new Map<string, CachedState>();
let initialized = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function isGitLabConfigured(): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, "gitlab.pat")).get();
  return !!row?.value;
}

async function isGitHubConfigured(): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, "github.token")).get();
  return !!row?.value;
}

async function isAutoMergeTodoEnabled(): Promise<boolean> {
  const row = await db.select().from(settings).where(eq(settings.key, "sourceControl.autoMergeTodo")).get();
  return row?.value === "true";
}

async function createMergeTodo(mr: { number: number; title: string; webUrl: string; provider: string }) {
  const prefix = mr.provider === "gitlab" ? "!" : "#";
  const now = new Date().toISOString();
  const todoId = crypto.randomUUID();
  await db.insert(todos).values({
    id: todoId,
    source: mr.provider,
    title: `Merge ${prefix}${mr.number}: ${mr.title}`,
    completed: false,
    url: mr.webUrl,
    priority: "high",
    createdAt: now,
    updatedAt: now,
  });
  broadcast({ type: "todo:updated", todoId });
  await createNotification({
    type: "todo_created",
    title: `Ready to merge ${prefix}${mr.number}`,
    detail: mr.title,
    url: mr.webUrl,
    meta: { todoId, provider: mr.provider, mrNumber: mr.number },
  });
}

async function pollMRStatus() {
  try {
    const [gitlabOk, githubOk] = await Promise.all([
      isGitLabConfigured(),
      isGitHubConfigured(),
    ]);

    const myMRs: {
      key: string;
      number: number;
      title: string;
      webUrl: string;
      provider: string;
      pipelineStatus: string | null;
      approved: boolean;
    }[] = [];

    const settled = await Promise.allSettled([
      gitlabOk
        ? getGitLabMRs().then((mrs) =>
            mrs
              .filter((mr) => mr.is_mine)
              .map((mr) => ({
                key: `gitlab:${mr.id}`,
                number: mr.iid,
                title: mr.title,
                webUrl: mr.web_url,
                provider: "gitlab",
                pipelineStatus: mr.pipeline_status,
                approved: mr.approved,
              })),
          )
        : Promise.resolve([]),
      githubOk
        ? getGitHubPRs().then((prs) =>
            prs
              .filter((pr) => pr.is_mine)
              .map((pr) => ({
                key: `github:${pr.id}`,
                number: pr.number,
                title: pr.title,
                webUrl: pr.web_url,
                provider: "github",
                pipelineStatus: pr.check_status,
                approved: pr.approved,
              })),
          )
        : Promise.resolve([]),
    ]);

    for (const r of settled) {
      if (r.status === "fulfilled") myMRs.push(...r.value);
      else console.error("[mr-poller] provider error:", r.reason);
    }

    if (!initialized) {
      // First poll: just populate cache, don't fire notifications
      for (const mr of myMRs) {
        cache.set(mr.key, {
          pipelineStatus: mr.pipelineStatus,
          approved: mr.approved,
        });
      }
      initialized = true;
      console.log(`[mr-poller] initialized cache with ${myMRs.length} self-owned MRs`);
      return;
    }

    for (const mr of myMRs) {
      const prev = cache.get(mr.key);
      const prefix = mr.provider === "gitlab" ? "!" : "#";

      if (prev) {
        // Pipeline status changed
        if (prev.pipelineStatus !== mr.pipelineStatus && mr.pipelineStatus) {
          await createNotification({
            type: "mr_pipeline",
            title: `Pipeline ${mr.pipelineStatus} on ${prefix}${mr.number}`,
            detail: mr.title,
            url: mr.webUrl,
            meta: {
              provider: mr.provider,
              mrNumber: mr.number,
              oldStatus: prev.pipelineStatus,
              newStatus: mr.pipelineStatus,
            },
          });
        }

        // Approval status changed
        if (!prev.approved && mr.approved) {
          await createNotification({
            type: "mr_approval",
            title: `${prefix}${mr.number} approved`,
            detail: mr.title,
            url: mr.webUrl,
            meta: { provider: mr.provider, mrNumber: mr.number },
          });
        }
      }

      // Auto-create merge todo when MR just became ready (approved + pipeline success)
      const wasReady = prev ? (prev.approved && (prev.pipelineStatus === "success")) : false;
      const isReady = mr.approved && mr.pipelineStatus === "success";
      if (isReady && !wasReady && prev) {
        if (await isAutoMergeTodoEnabled()) {
          await createMergeTodo(mr);
        }
      }

      cache.set(mr.key, {
        pipelineStatus: mr.pipelineStatus,
        approved: mr.approved,
      });
    }

    // Clean up cache entries for MRs that are no longer open
    const currentKeys = new Set(myMRs.map((mr) => mr.key));
    for (const key of cache.keys()) {
      if (!currentKeys.has(key)) cache.delete(key);
    }
  } catch (err) {
    console.error("[mr-poller] poll error:", err);
  }
}

export function startMRPoller() {
  console.log("[mr-poller] started (3 min interval)");
  pollMRStatus();
  intervalId = setInterval(pollMRStatus, 3 * 60 * 1000);
}

export function stopMRPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[mr-poller] stopped");
  }
}
