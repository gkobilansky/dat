import type { AgentJob, AgentProgressEvent } from "@dat/shared";

type ProgressFn = (event: AgentProgressEvent) => Promise<void>;

// Hosts the Dat agent loop (Claude Agent SDK) inside the per-case Docker
// sandbox with the case worktree bind-mounted. See PLAN.md "Key Design
// Decisions" 2, 4, and 5.
export async function runAgentTask(job: AgentJob, progress: ProgressFn): Promise<void> {
  await progress({
    type: "status",
    text: `Agent run not implemented yet (received ${job.kind} for case ${job.caseId})`,
  });
}
