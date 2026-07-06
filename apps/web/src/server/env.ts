import path from "node:path";

/**
 * Case storage lives on a local volume shared with the worker; relative
 * values are resolved against the repo root so both processes agree.
 */
export const CASE_STORAGE_DIR = path.resolve(
  process.cwd(),
  "../..",
  process.env.CASE_STORAGE_DIR ?? "./data/cases",
);

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
