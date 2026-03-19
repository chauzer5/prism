import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { slackChannels, slackConversations, slackUserDirectory } from "../db/schema.js";
import { fetchChannelMessages, getAuthStatus, getSelfUserIds } from "./client.js";
import type { SlackMessage } from "./client.js";
import { broadcast } from "../ws/events.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function startSlackPoller() {
  const auth = await getAuthStatus();
  if (auth.mode === "none") {
    console.log("[slack] no credentials available, poller disabled");
    return;
  }
  console.log(`[slack] poller started (auth mode: ${auth.mode})`);
  pollAllChannels();
  intervalId = setInterval(pollAllChannels, 5 * 60 * 1000);
}

export function stopSlackPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[slack] poller stopped");
  }
}

export async function pollAllChannels() {
  try {
    const channels = await db
      .select()
      .from(slackChannels)
      .where(eq(slackChannels.enabled, true))
      .all();

    for (const channel of channels) {
      try {
        await pollChannel(channel);
      } catch (err) {
        console.error(`[slack] error polling ${channel.name}:`, err);
      }
    }
  } catch (err) {
    console.error("[slack] error in pollAllChannels:", err);
  }
}

export async function pollSingleChannel(channelId: string) {
  const channel = await db
    .select()
    .from(slackChannels)
    .where(eq(slackChannels.id, channelId))
    .get();
  if (!channel) throw new Error(`Channel ${channelId} not found`);
  await pollChannel(channel);
}

/** Group flat messages into conversations (threads). */
function groupIntoConversations(messages: SlackMessage[]) {
  const threads = new Map<string, SlackMessage[]>();
  const order: string[] = [];

  for (const m of messages) {
    const key = m.threadTs ?? m.ts;
    if (!threads.has(key)) {
      threads.set(key, []);
      order.push(key);
    }
    threads.get(key)!.push(m);
  }

  return order.map((ts) => ({ parentTs: ts, messages: threads.get(ts)! }));
}

async function pollChannel(channel: typeof slackChannels.$inferSelect) {
  // Default to 7 days ago for first poll
  const oldest = channel.lastPolledAt
    ? (new Date(channel.lastPolledAt).getTime() / 1000).toString()
    : ((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000).toString();

  const messages = await fetchChannelMessages(channel.slackChannelId, oldest, channel.teamId);
  if (messages.length === 0) return;

  // Group messages into conversations
  const conversations = groupIntoConversations(messages);

  // Load existing conversation rows for this channel
  const existingRows = await db
    .select()
    .from(slackConversations)
    .where(eq(slackConversations.channelId, channel.id))
    .all();

  const existingByTs = new Map(existingRows.map((r) => [r.conversationTs, r]));

  // Build list of names the self user might appear as in resolved messages
  const selfIds = getSelfUserIds();
  const selfMentionNames: string[] = [];
  for (const id of selfIds) {
    const row = await db.select().from(slackUserDirectory)
      .where(eq(slackUserDirectory.slackUserId, id)).get();
    if (row) selfMentionNames.push(row.name);
  }

  const now = new Date().toISOString();
  let upsertCount = 0;

  for (const conv of conversations) {
    const existing = existingByTs.get(conv.parentTs);

    // Skip if message count hasn't changed
    if (existing && conv.messages.length <= existing.messageCount) continue;

    const parentMsg = conv.messages[0];

    // Detect mentions: check for "you" (from resolveUserNames) and also
    // check for the resolved display name (in case resolveUserNames didn't map self to "you")
    const mentionsMe = conv.messages.some(
      (m) =>
        m.user === "you" ||
        m.text.includes("@you") ||
        selfMentionNames.some((name) => m.text.includes(`@${name}`)),
    );

    const firstTs = Math.min(...conv.messages.map((m) => parseFloat(m.ts)));
    const lastTs = Math.max(...conv.messages.map((m) => parseFloat(m.ts)));
    const firstMessageAt = new Date(firstTs * 1000).toISOString();
    const lastMessageAt = new Date(lastTs * 1000).toISOString();
    const parentTsFloat = parseFloat(conv.parentTs);
    const day = new Date(parentTsFloat * 1000).toISOString().slice(0, 10);

    const messagesJson = JSON.stringify(
      conv.messages.map((m) => ({
        user: m.user,
        text: m.text,
        ts: m.ts,
        ...(m.threadTs ? { threadTs: m.threadTs } : {}),
      })),
    );

    if (existing) {
      await db
        .update(slackConversations)
        .set({
          messages: messagesJson,
          mentionsMe,
          parentText: parentMsg.text,
          parentUser: parentMsg.user,
          messageCount: conv.messages.length,
          lastMessageAt,
          updatedAt: now,
        })
        .where(eq(slackConversations.id, existing.id));
    } else {
      await db.insert(slackConversations).values({
        id: crypto.randomUUID(),
        channelId: channel.id,
        channelName: channel.name,
        conversationTs: conv.parentTs,
        day,
        messages: messagesJson,
        mentionsMe,
        parentText: parentMsg.text,
        parentUser: parentMsg.user,
        messageCount: conv.messages.length,
        firstMessageAt,
        lastMessageAt,
        createdAt: now,
        updatedAt: now,
      });
    }

    upsertCount++;
  }

  // Update lastPolledAt
  await db
    .update(slackChannels)
    .set({ lastPolledAt: now })
    .where(eq(slackChannels.id, channel.id));

  broadcast({ type: "slack:summary", channelId: channel.id, summaryId: "" });

  console.log(
    `[slack] ${channel.name}: ${messages.length} messages, ${upsertCount} conversations upserted`,
  );
}
