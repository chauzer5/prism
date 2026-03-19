import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import * as os from "node:os";

import {
  createPendingAgent,
  startAgent,
  stopAgent,
  redrawAgent,
  getAgentId,
  isRunning,
  getActivity,
} from "./manager.js";

export const agentsRouter = router({
  spawn: publicProcedure
    .input(
      z.object({
        prompt: z.string().optional(),
        model: z.string().optional(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const args: string[] = ["--dangerously-skip-permissions"];

      if (input.model) {
        args.push("--model", input.model);
      }

      if (input.prompt) {
        args.push(input.prompt);
      }

      let cwd = input.cwd;
      if (!cwd) {
        const row = await db.select().from(settings).where(eq(settings.key, "agents.cwd")).get();
        cwd = row?.value || os.homedir();
      }

      const id = createPendingAgent("claude", args, cwd);
      return { id };
    }),

  start: publicProcedure
    .input(
      z.object({
        cols: z.number().int().positive(),
        rows: z.number().int().positive(),
      })
    )
    .mutation(({ input }) => {
      const ok = startAgent(input.cols, input.rows);
      if (!ok) throw new Error("No pending agent or already started");
      return { success: true };
    }),

  stop: publicProcedure.mutation(() => {
    stopAgent();
    return { success: true };
  }),

  status: publicProcedure.query(() => {
    return { id: getAgentId(), running: isRunning(), activity: getActivity() };
  }),

  redraw: publicProcedure.mutation(() => {
    redrawAgent();
    return { success: true };
  }),
});
