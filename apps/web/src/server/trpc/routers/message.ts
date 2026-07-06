import { z } from "zod";
import type { AgentJob } from "@dat/shared";
import { agentQueue } from "@/lib/queue";
import { requireOwnedCase } from "../case-access";
import { publicProcedure, router } from "../init";

export const messageRouter = router({
  list: publicProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireOwnedCase(ctx, input.caseId);
      return ctx.prisma.message.findMany({
        where: { caseId: input.caseId },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true } } },
      });
    }),

  send: publicProcedure
    .input(
      z.object({
        caseId: z.string(),
        content: z.string().trim().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kase = await requireOwnedCase(ctx, input.caseId);
      const message = await ctx.prisma.message.create({
        data: {
          caseId: kase.id,
          role: "USER",
          content: input.content,
          authorId: ctx.user.id,
        },
      });
      const job: AgentJob = {
        kind: "user-message",
        caseId: kase.id,
        messageId: message.id,
      };
      await agentQueue.add("user-message", job);
      return message;
    }),
});
