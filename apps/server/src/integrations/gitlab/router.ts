import { z } from "zod";
import { router, publicProcedure } from "../../trpc.js";
import {
  getMergeRequests,
  getMRDetail,
  mergeMR,
  addMRNote,
  playJob,
  retryJob,
  testConnection,
} from "./client.js";

export const gitlabRouter = router({
  mergeRequests: publicProcedure.query(async () => {
    return getMergeRequests();
  }),

  mrDetail: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number() }))
    .query(async ({ input }) => {
      return getMRDetail(input.projectId, input.mrIid);
    }),

  merge: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number() }))
    .mutation(async ({ input }) => {
      return mergeMR(input.projectId, input.mrIid);
    }),

  addNote: publicProcedure
    .input(z.object({ projectId: z.number(), mrIid: z.number(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addMRNote(input.projectId, input.mrIid, input.body);
    }),

  playJob: publicProcedure
    .input(z.object({ projectId: z.number(), jobId: z.number() }))
    .mutation(async ({ input }) => {
      return playJob(input.projectId, input.jobId);
    }),

  retryJob: publicProcedure
    .input(z.object({ projectId: z.number(), jobId: z.number() }))
    .mutation(async ({ input }) => {
      return retryJob(input.projectId, input.jobId);
    }),

  testConnection: publicProcedure.mutation(async () => {
    return testConnection();
  }),
});
