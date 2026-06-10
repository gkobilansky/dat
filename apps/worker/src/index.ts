import { Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  AGENT_QUEUE,
  progressChannel,
  type AgentJob,
  type AgentProgressEvent,
} from "@dat/shared";
import { runAgentTask } from "./agent/run";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const publisher = new Redis(redisUrl);

async function publish(caseId: string, event: AgentProgressEvent) {
  await publisher.publish(progressChannel(caseId), JSON.stringify(event));
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
  { connection: { url: redisUrl, maxRetriesPerRequest: null } },
);

worker.on("ready", () => {
  console.log(`[worker] listening on queue "${AGENT_QUEUE}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id} failed:`, error);
});
