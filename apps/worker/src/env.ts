import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/** Must resolve to the same volume the web app writes to. */
export const CASE_STORAGE_DIR = path.resolve(
  repoRoot,
  process.env.CASE_STORAGE_DIR ?? "./data/cases",
);

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export type AgentMode = "claude" | "stub";

/**
 * "claude" runs the Claude Agent SDK; "stub" is a deterministic offline
 * agent used in dev and tests. Until the per-case Docker sandbox lands,
 * claude mode executes bash on the host worktree, so it requires an
 * explicit DAT_AGENT_MODE=claude opt-in — a key alone doesn't enable it.
 */
export function agentMode(): AgentMode {
  return process.env.DAT_AGENT_MODE === "claude" &&
    process.env.ANTHROPIC_API_KEY
    ? "claude"
    : "stub";
}
