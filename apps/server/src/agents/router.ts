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
  spawnExternalAgent,
  stopExternalAgent,
  focusTerminal,
  getExternalAgentId,
  isExternalRunning,
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

  /** Spawn an agent in a real macOS Terminal.app window */
  spawnExternal: publicProcedure
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

      return spawnExternalAgent("claude", args, cwd);
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
    // Stop whichever is running
    if (isExternalRunning()) {
      stopExternalAgent();
    } else {
      stopAgent();
    }
    return { success: true };
  }),

  status: publicProcedure.query(() => {
    const extId = getExternalAgentId();
    const ptyId = getAgentId();
    return {
      id: extId || ptyId,
      running: isRunning() || isExternalRunning(),
      activity: getActivity(),
      mode: isExternalRunning() ? "external" as const : "pty" as const,
    };
  }),

  focusTerminal: publicProcedure.mutation(() => {
    focusTerminal();
    return { success: true };
  }),

  redraw: publicProcedure.mutation(() => {
    redrawAgent();
    return { success: true };
  }),
});
