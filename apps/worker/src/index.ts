import "./env";
import { Worker } from "bullmq";
import {
  AGENT_QUEUE,
  progressChannel,
  type AgentJob,
  type AgentProgressEvent,
} from "@dat/shared";
import { REDIS_URL, agentMode } from "./env";
import { redis } from "./redis";
import { runAgentTask } from "./agent/run";

async function publish(caseId: string, event: AgentProgressEvent) {
  await redis.publish(progressChannel(caseId), JSON.stringify(event));
}

const worker = new Worker<AgentJob>(
  AGENT_QUEUE,
  async (job) => {
    const { caseId } = job.data;
    await publish(caseId, { type: "status", text: `Starting ${job.data.kind}` });
    try {
      await runAgentTask(job.data, (event) => publish(caseId, event));
      await publish(caseId, { type: "done", ok: true });
    } catch (error) {
      await publish(caseId, {
        type: "done",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  { connection: { url: REDIS_URL, maxRetriesPerRequest: null }, concurrency: 4 },
);

worker.on("ready", () => {
  console.log(
    `[worker] listening on queue "${AGENT_QUEUE}" (agent mode: ${agentMode()})`,
  );
  if (agentMode() === "claude") {
    console.warn(
      "[worker] claude mode runs agent bash on the host worktree (Docker sandbox not yet implemented) — dev use only",
    );
  }
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id} failed:`, error);
});
