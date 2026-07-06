import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LeaseTimeoutError,
  acquireCaseLease,
  caseLeaseKey,
  releaseCaseLease,
  withCaseLease,
} from "../src/lease";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let redis: Redis;

beforeAll(() => {
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
});

afterAll(async () => {
  await redis.quit();
});

function testCaseId(): string {
  return `lease-test-${crypto.randomUUID()}`;
}

describe("case lease", () => {
  it("acquires and releases", async () => {
    const caseId = testCaseId();
    const token = await acquireCaseLease(redis, caseId);
    expect(await redis.get(caseLeaseKey(caseId))).toBe(token);
    expect(await releaseCaseLease(redis, caseId, token)).toBe(true);
    expect(await redis.get(caseLeaseKey(caseId))).toBeNull();
  });

  it("blocks a second writer until released", async () => {
    const caseId = testCaseId();
    const token = await acquireCaseLease(redis, caseId);
    await expect(
      acquireCaseLease(redis, caseId, { acquireTimeoutMs: 300, retryDelayMs: 50 }),
    ).rejects.toThrow(LeaseTimeoutError);
    await releaseCaseLease(redis, caseId, token);
    const second = await acquireCaseLease(redis, caseId, { acquireTimeoutMs: 300 });
    expect(second).not.toBe(token);
    await releaseCaseLease(redis, caseId, second);
  });

  it("release with a stale token is a no-op", async () => {
    const caseId = testCaseId();
    const token = await acquireCaseLease(redis, caseId);
    expect(await releaseCaseLease(redis, caseId, "wrong-token")).toBe(false);
    expect(await redis.get(caseLeaseKey(caseId))).toBe(token);
    await releaseCaseLease(redis, caseId, token);
  });

  it("withCaseLease releases on error", async () => {
    const caseId = testCaseId();
    await expect(
      withCaseLease(redis, caseId, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await redis.get(caseLeaseKey(caseId))).toBeNull();
  });

  it("serializes concurrent writers", async () => {
    const caseId = testCaseId();
    const order: string[] = [];
    await Promise.all([
      withCaseLease(redis, caseId, async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 150));
        order.push("a-end");
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 20));
        await withCaseLease(
          redis,
          caseId,
          async () => {
            order.push("b-start");
          },
          { acquireTimeoutMs: 5_000 },
        );
      })(),
    ]);
    expect(order).toEqual(["a-start", "a-end", "b-start"]);
  });

  it("expires after ttl so a crashed holder cannot deadlock", async () => {
    const caseId = testCaseId();
    await acquireCaseLease(redis, caseId, { ttlMs: 100 });
    const token = await acquireCaseLease(redis, caseId, {
      acquireTimeoutMs: 2_000,
      retryDelayMs: 50,
    });
    expect(token).toBeTruthy();
    await releaseCaseLease(redis, caseId, token);
  });
});
