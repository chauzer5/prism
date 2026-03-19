import { z } from "zod";
import { eq, desc, asc, sql } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { slackChannels, slackConversations } from "../db/schema.js";
import { resolveChannelId, getAuthStatus, resetSlackClients, fetchAllMentions } from "./client.js";
import { pollAllChannels, pollSingleChannel } from "./poller.js";
import { getUnreadDmStats, getUnreadDmDetails } from "./dm-poller.js";

export const slackRouter = router({
  auth: router({
    status: publicProcedure.query(() => {
      return getAuthStatus();
    }),

    refresh: publicProcedure.mutation(() => {
      resetSlackClients();
      return getAuthStatus();
    }),
  }),

  channels: router({
    list: publicProcedure.query(async () => {
      return db
        .select()
        .from(slackChannels)
        .orderBy(
          sql`CASE WHEN ${slackChannels.sortOrder} IS NULL THEN 1 ELSE 0 END`,
          asc(slackChannels.sortOrder),
          asc(slackChannels.createdAt),
        )
        .all();
    }),

    reorder: publicProcedure
      .input(z.array(z.object({ id: z.string(), sortOrder: z.number() })))
      .mutation(async ({ input }) => {
        for (const { id, sortOrder } of input) {
          await db
            .update(slackChannels)
            .set({ sortOrder })
            .where(eq(slackChannels.id, id));
        }
        return { ok: true };
      }),

    add: publicProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slackChannelId: z.string().optional(),
          teamId: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        let channelId = input.slackChannelId;
        let channelName = input.name;

        // Resolve channel ID from name if not provided
        if (!channelId) {
          const resolved = await resolveChannelId(input.name, input.teamId);
          if (!resolved) throw new Error(`Channel "${input.name}" not found in Slack`);
          channelId = resolved.id;
          channelName = `#${resolved.name}`;
        }

        const id = crypto.randomUUID();
        await db.insert(slackChannels).values({
          id,
          slackChannelId: channelId,
          name: channelName,
          teamId: input.teamId ?? null,
          enabled: true,
          createdAt: new Date().toISOString(),
        });
        return { id };
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          enabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const updates: Record<string, unknown> = {};
        if (input.enabled !== undefined) updates.enabled = input.enabled;

        await db
          .update(slackChannels)
          .set(updates)
          .where(eq(slackChannels.id, input.id));
        return { id: input.id };
      }),

    remove: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.delete(slackChannels).where(eq(slackChannels.id, input.id));
        return { id: input.id };
      }),
  }),

  threads: router({
    mentions: publicProcedure.query(async () => {
      return fetchAllMentions();
    }),

    byChannel: publicProcedure
      .input(z.object({ channelId: z.string(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const limit = input.limit ?? 50;
        return db.select().from(slackConversations)
          .where(eq(slackConversations.channelId, input.channelId))
          .orderBy(desc(slackConversations.lastMessageAt))
          .limit(limit).all();
      }),

    latest: publicProcedure.query(async () => {
      const channels = await db.select().from(slackChannels)
        .where(eq(slackChannels.enabled, true))
        .orderBy(
          sql`CASE WHEN ${slackChannels.sortOrder} IS NULL THEN 1 ELSE 0 END`,
          asc(slackChannels.sortOrder),
          asc(slackChannels.createdAt),
        ).all();

      const results = [];
      for (const channel of channels) {
        const [thread] = await db.select().from(slackConversations)
          .where(eq(slackConversations.channelId, channel.id))
          .orderBy(desc(slackConversations.lastMessageAt))
          .limit(1).all();
        results.push({ channel, thread: thread ?? null });
      }
      return results;
    }),
  }),

  unreadDms: publicProcedure.query(() => {
    return getUnreadDmStats();
  }),

  unreadDmDetails: publicProcedure.query(() => {
    return getUnreadDmDetails();
  }),

  pollNow: publicProcedure.mutation(() => {
    pollAllChannels().catch((err) =>
      console.error("[slack] background poll error:", err)
    );
    return { ok: true };
  }),

  pollChannel: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(({ input }) => {
      pollSingleChannel(input.channelId).catch((err) =>
        console.error("[slack] background channel poll error:", err)
      );
      return { ok: true };
    }),
});
