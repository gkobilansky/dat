import { Redis } from "ioredis";
import { REDIS_URL } from "./env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ?? new Redis(REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/** Pub/sub requires a dedicated connection per subscriber. */
export function createRedisSubscriber(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}
