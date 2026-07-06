import { Queue } from "bullmq";
import { AGENT_QUEUE } from "@dat/shared";
import { REDIS_URL } from "@/server/env";

const globalForQueue = globalThis as unknown as { agentQueue?: Queue };

export const agentQueue =
  globalForQueue.agentQueue ??
  new Queue(AGENT_QUEUE, {
    connection: { url: REDIS_URL, maxRetriesPerRequest: null },
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.agentQueue = agentQueue;
}
