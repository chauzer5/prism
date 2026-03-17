import { z } from "zod";
import { router, publicProcedure } from "../../trpc.js";
import { getIssues, getIssueDetail, addComment, testConnection } from "./client.js";

export const linearRouter = router({
  issues: publicProcedure.query(async () => {
    return getIssues();
  }),

  issueDetail: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ input }) => {
      return getIssueDetail(input.identifier);
    }),

  addComment: publicProcedure
    .input(z.object({ issueId: z.string(), body: z.string() }))
    .mutation(async ({ input }) => {
      return addComment(input.issueId, input.body);
    }),

  testConnection: publicProcedure.mutation(async () => {
    return testConnection();
  }),
});
