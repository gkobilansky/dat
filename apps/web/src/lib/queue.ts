import { Queue } from "bullmq";
import { AGENT_QUEUE } from "@dat/shared";

export const agentQueue = new Queue(AGENT_QUEUE, {
  connection: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  },
});
