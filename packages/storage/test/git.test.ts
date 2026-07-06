import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CasePathError,
  caseHeadSha,
  caseLog,
  casePaths,
  caseRepoExists,
  commitCaseFiles,
  commitCaseWorktree,
  initCaseRepo,
  listCaseFiles,
  readCaseFile,
  resolveCaseFile,
  tagCaseHead,
} from "../src/git";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "dat-storage-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

const SEED = [
  { path: "notes.md", content: "# Notes\n" },
  { path: "data.csv", content: "a,b\n1,2\n" },
];

describe("initCaseRepo", () => {
  it("creates bare repo + worktree with seed commit", async () => {
    const sha = await initCaseRepo(rootDir, "my-case", SEED);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await caseRepoExists(rootDir, "my-case")).toBe(true);
    expect(await listCaseFiles(rootDir, "my-case")).toEqual(["data.csv", "notes.md"]);
    expect(await readCaseFile(rootDir, "my-case", "notes.md")).toBe("# Notes\n");
  });

  it("rejects invalid slugs", () => {
    expect(() => casePaths(rootDir, "../evil")).toThrow(CasePathError);
    expect(() => casePaths(rootDir, "Has Spaces")).toThrow(CasePathError);
  });
});

describe("commitCaseFiles", () => {
  it("commits changes and pushes to the bare repo", async () => {
    await initCaseRepo(rootDir, "c1", SEED);
    const sha = await commitCaseFiles(
      rootDir,
      "c1",
      [{ path: "reports/summary.md", content: "hello\n" }],
      "Add summary",
    );
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await caseHeadSha(rootDir, "c1")).toBe(sha);
    expect(await listCaseFiles(rootDir, "c1")).toContain("reports/summary.md");

    const log = await caseLog(rootDir, "c1");
    expect(log[0]?.message).toBe("Add summary");
    expect(log).toHaveLength(2);
  });

  it("returns null when nothing changed", async () => {
    await initCaseRepo(rootDir, "c2", SEED);
    const sha = await commitCaseFiles(rootDir, "c2", SEED, "No-op");
    expect(sha).toBeNull();
  });

  it("records the author", async () => {
    await initCaseRepo(rootDir, "c3", SEED);
    await commitCaseFiles(
      rootDir,
      "c3",
      [{ path: "notes.md", content: "changed\n" }],
      "User edit",
      { name: "Gene", email: "gene@lancekey.com" },
    );
    const log = await caseLog(rootDir, "c3");
    expect(log[0]?.authorName).toBe("Gene");
  });

  it("rejects path traversal and .git writes", async () => {
    await initCaseRepo(rootDir, "c4", SEED);
    await expect(
      commitCaseFiles(rootDir, "c4", [{ path: "../escape.md", content: "x" }], "evil"),
    ).rejects.toThrow(CasePathError);
    await expect(
      commitCaseFiles(rootDir, "c4", [{ path: ".git/config", content: "x" }], "evil"),
    ).rejects.toThrow(CasePathError);
  });
});

describe("commitCaseWorktree", () => {
  it("commits ad-hoc worktree changes", async () => {
    await initCaseRepo(rootDir, "c5", SEED);
    const { worktreeDir } = casePaths(rootDir, "c5");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(worktreeDir, "adhoc.txt"), "agent wrote this\n");
    const sha = await commitCaseWorktree(rootDir, "c5", "Dat: adhoc work");
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await listCaseFiles(rootDir, "c5")).toContain("adhoc.txt");
  });

  it("returns null on a clean worktree", async () => {
    await initCaseRepo(rootDir, "c6", SEED);
    expect(await commitCaseWorktree(rootDir, "c6", "noop")).toBeNull();
  });
});

describe("tagCaseHead", () => {
  it("tags HEAD with a sanitized name", async () => {
    await initCaseRepo(rootDir, "c7", SEED);
    await tagCaseHead(rootDir, "c7", "milestone one!", "First milestone");
    const { worktreeDir } = casePaths(rootDir, "c7");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("git", ["tag"], { cwd: worktreeDir });
    expect(stdout.trim()).toBe("milestone-one");
  });
});

describe("resolveCaseFile", () => {
  it("allows nested paths and rejects escapes", () => {
    const worktree = "/tmp/wt";
    expect(resolveCaseFile(worktree, "a/b/c.md")).toBe("/tmp/wt/a/b/c.md");
    expect(() => resolveCaseFile(worktree, "../x")).toThrow(CasePathError);
    expect(() => resolveCaseFile(worktree, "/etc/passwd")).toThrow(CasePathError);
    expect(() => resolveCaseFile(worktree, "a/../../x")).toThrow(CasePathError);
    expect(() => resolveCaseFile(worktree, ".git/hooks/pre-commit")).toThrow(CasePathError);
    expect(() => resolveCaseFile(worktree, "")).toThrow(CasePathError);
  });
});
