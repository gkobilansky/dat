import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { caseLog, initCaseRepo } from "@dat/storage";
import { CASE_STORAGE_DIR } from "../../env";
import { publicProcedure, router } from "../init";

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return base ? `${base}-${suffix}` : `case-${suffix}`;
}

function seedFiles(title: string) {
  return [
    {
      path: "notes.md",
      content: `# ${title}\n\nCase notes live here. Ask Dat to analyze files or draft documents.\n`,
    },
    {
      path: "data.csv",
      content: "item,amount\nsample,100\n",
    },
  ];
}

export const caseRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.prisma.case.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    }),
  ),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.prisma.case.findUnique({ where: { id: input.id } });
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      return found;
    }),

  create: publicProcedure
    .input(z.object({ title: z.string().trim().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const repoSlug = slugify(input.title);
      await initCaseRepo(CASE_STORAGE_DIR, repoSlug, seedFiles(input.title));
      return ctx.prisma.case.create({
        data: { title: input.title, repoSlug, ownerId: ctx.user.id },
      });
    }),

  timeline: publicProcedure
    .input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.prisma.case.findUnique({ where: { id: input.id } });
      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      return caseLog(CASE_STORAGE_DIR, found.repoSlug, input.limit);
    }),
});
