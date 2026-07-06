import { TRPCError } from "@trpc/server";
import type { Case } from "@dat/db";
import type { TrpcContext } from "./init";

/**
 * Fetches a case the current user owns, or throws NOT_FOUND. Every case-scoped
 * endpoint routes through this so a case ID from another owner is
 * indistinguishable from one that doesn't exist (no ownership leak).
 */
export async function requireOwnedCase(
  ctx: TrpcContext,
  caseId: string,
): Promise<Case> {
  const found = await ctx.prisma.case.findFirst({
    where: { id: caseId, ownerId: ctx.user.id },
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
  return found;
}
