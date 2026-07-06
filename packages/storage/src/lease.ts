import { randomUUID } from "node:crypto";

/**
 * Minimal subset of the ioredis client used by the lease. Declared as an
 * interface so this package carries no runtime Redis dependency.
 */
export interface LeaseClient {
  set(
    key: string,
    value: string,
    px: "PX",
    ttlMs: number,
    nx: "NX",
  ): Promise<"OK" | null>;
  /** Redis server-side Lua EVAL (ioredis signature), not JS eval. */
  eval(
    script: string,
    numKeys: number,
    ...keysAndArgs: Array<string | number>
  ): Promise<unknown>;
}

export function caseLeaseKey(caseId: string): string {
  return `case:${caseId}:lease`;
}

export class LeaseTimeoutError extends Error {
  constructor(public readonly caseId: string) {
    super(`Timed out acquiring lease for case ${caseId}`);
    this.name = "LeaseTimeoutError";
  }
}

export interface LeaseOptions {
  /** How long the lease is held before Redis expires it (crash safety). */
  ttlMs?: number;
  /** How long to keep retrying before giving up. */
  acquireTimeoutMs?: number;
  retryDelayMs?: number;
}

const DEFAULTS: Required<LeaseOptions> = {
  ttlMs: 60_000,
  acquireTimeoutMs: 10_000,
  retryDelayMs: 150,
};

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns a release token. Only the holder of the token can release. */
export async function acquireCaseLease(
  client: LeaseClient,
  caseId: string,
  options: LeaseOptions = {},
): Promise<string> {
  const { ttlMs, acquireTimeoutMs, retryDelayMs } = { ...DEFAULTS, ...options };
  const token = randomUUID();
  const key = caseLeaseKey(caseId);
  const deadline = Date.now() + acquireTimeoutMs;
  for (;;) {
    const ok = await client.set(key, token, "PX", ttlMs, "NX");
    if (ok === "OK") return token;
    if (Date.now() >= deadline) throw new LeaseTimeoutError(caseId);
    await sleep(retryDelayMs);
  }
}

/** Compare-and-delete; a stale token (expired and re-acquired) is a no-op. */
export async function releaseCaseLease(
  client: LeaseClient,
  caseId: string,
  token: string,
): Promise<boolean> {
  const result = await client.eval(RELEASE_SCRIPT, 1, caseLeaseKey(caseId), token);
  return result === 1;
}

export async function withCaseLease<T>(
  client: LeaseClient,
  caseId: string,
  fn: () => Promise<T>,
  options?: LeaseOptions,
): Promise<T> {
  const token = await acquireCaseLease(client, caseId, options);
  try {
    return await fn();
  } finally {
    await releaseCaseLease(client, caseId, token);
  }
}
