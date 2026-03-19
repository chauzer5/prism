import { db } from "../db/index.js";
import { slackChannels, todos } from "../db/schema.js";
import { eq, like, isNull, sql } from "drizzle-orm";
import { getAuthStatus } from "./client.js";

/**
 * On startup, backfill team IDs from desktop credentials into slack_channels
 * and fix any todo URLs that are missing the team parameter.
 */
export async function backfillTeamIds() {
  const auth = await getAuthStatus();
  if (auth.mode === "none" || auth.workspaces.length === 0) {
    console.log("[backfill] no Slack credentials available, skipping");
    return;
  }

  // For single-workspace setups, use that team ID for all channels missing one
  // For multi-workspace, we can't reliably guess — skip
  if (auth.workspaces.length === 1) {
    const teamId = auth.workspaces[0].teamId;

    // Backfill slack_channels.team_id
    const channelsUpdated = db
      .update(slackChannels)
      .set({ teamId })
      .where(isNull(slackChannels.teamId))
      .run();

    if (channelsUpdated.changes > 0) {
      console.log(`[backfill] set team_id=${teamId} on ${channelsUpdated.changes} channels`);
    }

    // Fix todo URLs: ensure all Slack URLs use slack://channel?team=T&id=C format
    // Convert from app_redirect or bare slack:// without team param
    const slackTodos = db
      .select({ id: todos.id, url: todos.url })
      .from(todos)
      .where(
        sql`(${todos.url} LIKE 'slack://%' AND ${todos.url} NOT LIKE '%team=%')
         OR ${todos.url} LIKE '%slack.com/app_redirect%'
         OR ${todos.url} LIKE '%slack.com/archives/%'`
      )
      .all();

    let urlsFixed = 0;
    for (const todo of slackTodos) {
      if (!todo.url) continue;
      let channelId: string | undefined;
      let msgTs: string | undefined;

      if (todo.url.includes("app_redirect")) {
        // https://slack.com/app_redirect?team=T&channel=C&message_ts=ts
        channelId = todo.url.match(/[?&]channel=([A-Z0-9]+)/)?.[1];
        msgTs = todo.url.match(/[?&]message_ts=([0-9.]+)/)?.[1];
      } else if (todo.url.includes("/archives/")) {
        // https://slack.com/archives/C/pTs
        channelId = todo.url.match(/\/archives\/([A-Z0-9]+)/)?.[1];
        const pTs = todo.url.match(/\/p(\d+)$/)?.[1];
        if (pTs) msgTs = pTs.slice(0, 10) + "." + pTs.slice(10);
      } else {
        // slack://channel?id=C&message=ts (missing team)
        channelId = todo.url.match(/[?&]id=([A-Z0-9]+)/)?.[1];
        msgTs = todo.url.match(/[?&]message=([0-9.]+)/)?.[1];
      }

      if (!channelId) continue;
      const newUrl = `slack://channel?team=${teamId}&id=${channelId}${msgTs ? `&message=${msgTs}` : ""}`;
      db.update(todos).set({ url: newUrl }).where(eq(todos.id, todo.id)).run();
      urlsFixed++;
    }

    if (urlsFixed > 0) {
      console.log(`[backfill] fixed ${urlsFixed} todo URLs → slack:// with team=${teamId}`);
    }
  } else {
    console.log(`[backfill] ${auth.workspaces.length} workspaces found, skipping auto-backfill (ambiguous)`);
  }
}
