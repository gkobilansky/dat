import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentProgressEvent } from "@dat/shared";
import { caseLog, initCaseRepo, listCaseFiles, readCaseFile } from "@dat/storage";
import { runStubAgent } from "../src/agent/stub";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "dat-stub-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("runStubAgent", () => {
  it("analyzes the case, commits a summary, and reports progress", async () => {
    await initCaseRepo(rootDir, "stub-case", [
      { path: "notes.md", content: "# Case\n" },
      { path: "expenses.csv", content: "item,amount\nrent,1200\nfood,300\n" },
    ]);

    const events: AgentProgressEvent[] = [];
    const reply = await runStubAgent({
      rootDir,
      slug: "stub-case",
      caseId: "case-id",
      userMessage: "Summarize my expenses",
      progress: async (event) => {
        events.push(event);
      },
    });

    expect(reply).toContain("2 files");
    expect(reply).toContain("expenses.csv");
    expect(reply).toContain("analysis/summary.md");

    expect(await listCaseFiles(rootDir, "stub-case")).toContain("analysis/summary.md");
    const summary = await readCaseFile(rootDir, "stub-case", "analysis/summary.md");
    expect(summary).toContain("Total amount: 1500");
    expect(summary).toContain("Summarize my expenses");

    const log = await caseLog(rootDir, "stub-case");
    expect(log[0]?.message).toBe("Dat: update case summary");

    const commitEvent = events.find((event) => event.type === "commit");
    expect(commitEvent).toBeDefined();
    expect(events.some((event) => event.type === "status")).toBe(true);
  });

  it("is idempotent when nothing changes between runs", async () => {
    await initCaseRepo(rootDir, "stub-case", [
      { path: "notes.md", content: "# Case\n" },
    ]);
    const progress = async () => {};
    const ctx = {
      rootDir,
      slug: "stub-case",
      caseId: "case-id",
      userMessage: "same question",
      progress,
    };
    await runStubAgent(ctx);
    const before = await caseLog(rootDir, "stub-case");
    await runStubAgent(ctx);
    const after = await caseLog(rootDir, "stub-case");
    expect(after).toHaveLength(before.length);
  });
});
