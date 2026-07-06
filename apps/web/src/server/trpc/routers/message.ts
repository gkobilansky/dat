import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { AgentJob } from "@dat/shared";
import { agentQueue } from "@/lib/queue";
import { publicProcedure, router } from "../init";

export const messageRouter = router({
  list: publicProcedure
    .input(z.object({ caseId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.message.findMany({
        where: { caseId: input.caseId },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true } } },
      }),
    ),

  send: publicProcedure
    .input(
      z.object({
        caseId: z.string(),
        content: z.string().trim().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kase = await ctx.prisma.case.findUnique({ where: { id: input.caseId } });
      if (!kase) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
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
