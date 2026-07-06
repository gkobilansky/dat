import type { AgentJob, AgentProgressEvent } from "@dat/shared";
import { prisma } from "@dat/db";
import { withCaseLease } from "@dat/storage";
import { CASE_STORAGE_DIR, agentMode } from "../env";
import { redis } from "../redis";
import { runClaudeAgent } from "./claude";
import { runStubAgent } from "./stub";
import type { AgentContext } from "./types";

type ProgressFn = (event: AgentProgressEvent) => Promise<void>;

// Matches the sandbox task budget from PLAN.md (10 min).
const TASK_LEASE = { ttlMs: 10 * 60_000, acquireTimeoutMs: 30_000 };

async function jobPrompt(job: AgentJob): Promise<string> {
  if (job.kind === "user-message") {
    const message = await prisma.message.findUnique({
      where: { id: job.messageId },
    });
    if (!message) throw new Error(`Message ${job.messageId} not found`);
    return message.content;
  }
  return `These files changed and may need your attention: ${job.paths.join(", ")}`;
}

export async function runAgentTask(
  job: AgentJob,
  progress: ProgressFn,
): Promise<void> {
  const kase = await prisma.case.findUnique({ where: { id: job.caseId } });
  if (!kase) throw new Error(`Case ${job.caseId} not found`);

  const userMessage = await jobPrompt(job);
  const runner = agentMode() === "claude" ? runClaudeAgent : runStubAgent;
  const ctx: AgentContext = {
    rootDir: CASE_STORAGE_DIR,
    slug: kase.repoSlug,
    caseId: kase.id,
    userMessage,
    progress,
  };

  const reply = await withCaseLease(redis, kase.id, () => runner(ctx), TASK_LEASE);

  await prisma.message.create({
    data: { caseId: kase.id, role: "AGENT", content: reply },
  });
  await prisma.case.update({
    where: { id: kase.id },
    data: { updatedAt: new Date() },
  });
}
