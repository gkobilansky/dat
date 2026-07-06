import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  CasePathError,
  caseHeadSha,
  commitCaseFiles,
  listCaseFiles,
  readCaseFile,
  withCaseLease,
} from "@dat/storage";
import type { Case } from "@dat/db";
import { CASE_STORAGE_DIR } from "../../env";
import { publicProcedure, router, type TrpcContext } from "../init";

async function requireCase(ctx: TrpcContext, caseId: string): Promise<Case> {
  const found = await ctx.prisma.case.findUnique({ where: { id: caseId } });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
  return found;
}

function rethrowPathError(error: unknown): never {
  if (error instanceof CasePathError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

const filePathSchema = z.string().min(1).max(500);

export const fileRouter = router({
  list: publicProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const kase = await requireCase(ctx, input.caseId);
      return listCaseFiles(CASE_STORAGE_DIR, kase.repoSlug);
    }),

  read: publicProcedure
    .input(z.object({ caseId: z.string(), path: filePathSchema }))
    .query(async ({ ctx, input }) => {
      const kase = await requireCase(ctx, input.caseId);
      try {
        const content = await readCaseFile(CASE_STORAGE_DIR, kase.repoSlug, input.path);
        const sha = await caseHeadSha(CASE_STORAGE_DIR, kase.repoSlug);
        return { path: input.path, content, sha };
      } catch (error) {
        rethrowPathError(error);
      }
    }),

  save: publicProcedure
    .input(
      z.object({
        caseId: z.string(),
        files: z
          .array(z.object({ path: filePathSchema, content: z.string().max(5_000_000) }))
          .min(1)
          .max(10),
        message: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kase = await requireCase(ctx, input.caseId);
      const message =
        input.message ?? `Update ${input.files.map((f) => f.path).join(", ")}`;
      const author = {
        name: ctx.user.name ?? ctx.user.email,
        email: ctx.user.email,
      };
      try {
        const sha = await withCaseLease(ctx.redis, kase.id, () =>
          commitCaseFiles(CASE_STORAGE_DIR, kase.repoSlug, input.files, message, author),
        );
        await ctx.prisma.case.update({
          where: { id: kase.id },
          data: { updatedAt: new Date() },
        });
        return { sha };
      } catch (error) {
        rethrowPathError(error);
      }
    }),
});
