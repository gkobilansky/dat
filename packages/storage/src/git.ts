import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export const DAT_AUTHOR = { name: "Dat", email: "dat@localhost" } as const;

export interface CaseAuthor {
  name: string;
  email: string;
}

export interface CaseFileChange {
  path: string;
  content: string;
}

export interface CaseCommit {
  sha: string;
  message: string;
  authorName: string;
  date: string;
}

export class CasePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CasePathError";
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertCaseSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new CasePathError(`Invalid case slug: ${JSON.stringify(slug)}`);
  }
}

export function casePaths(rootDir: string, slug: string) {
  assertCaseSlug(slug);
  return {
    bareDir: path.resolve(rootDir, `${slug}.git`),
    worktreeDir: path.resolve(rootDir, slug),
  };
}

/** Resolves a repo-relative path, rejecting traversal and .git access. */
export function resolveCaseFile(worktreeDir: string, filePath: string): string {
  const resolved = path.resolve(worktreeDir, filePath);
  const rel = path.relative(worktreeDir, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new CasePathError(`Path escapes case worktree: ${filePath}`);
  }
  if (rel.split(path.sep).includes(".git")) {
    throw new CasePathError(`Path touches .git: ${filePath}`);
  }
  return resolved;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function caseRepoExists(
  rootDir: string,
  slug: string,
): Promise<boolean> {
  const { worktreeDir } = casePaths(rootDir, slug);
  try {
    await git(worktreeDir, "rev-parse", "--is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

/** Creates the bare repo + worktree clone and commits the seed files. */
export async function initCaseRepo(
  rootDir: string,
  slug: string,
  seedFiles: CaseFileChange[],
  message = "Initialize case",
): Promise<string> {
  const { bareDir, worktreeDir } = casePaths(rootDir, slug);
  await mkdir(rootDir, { recursive: true });
  await git(rootDir, "init", "--bare", "--initial-branch=main", bareDir);
  await git(rootDir, "clone", bareDir, worktreeDir);
  await git(worktreeDir, "config", "user.name", DAT_AUTHOR.name);
  await git(worktreeDir, "config", "user.email", DAT_AUTHOR.email);
  const sha = await commitCaseFiles(rootDir, slug, seedFiles, message);
  if (!sha) throw new Error(`Case ${slug} initialized with no seed commit`);
  return sha;
}

export async function deleteCaseRepo(rootDir: string, slug: string): Promise<void> {
  const { bareDir, worktreeDir } = casePaths(rootDir, slug);
  await rm(worktreeDir, { recursive: true, force: true });
  await rm(bareDir, { recursive: true, force: true });
}

/**
 * Writes files into the worktree, commits, and pushes to the bare repo.
 * Returns the commit sha, or null when nothing changed. Callers must hold
 * the case lease.
 */
export async function commitCaseFiles(
  rootDir: string,
  slug: string,
  files: CaseFileChange[],
  message: string,
  author: CaseAuthor = DAT_AUTHOR,
): Promise<string | null> {
  const { worktreeDir } = casePaths(rootDir, slug);
  for (const file of files) {
    const abs = resolveCaseFile(worktreeDir, file.path);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, file.content, "utf8");
  }
  const paths = files.map((f) => f.path);
  await git(worktreeDir, "add", "--", ...paths);
  const status = await git(worktreeDir, "status", "--porcelain", "--", ...paths);
  if (!status.trim()) return null;
  await git(
    worktreeDir,
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.email}`,
    "commit",
    "-m",
    message,
  );
  await git(worktreeDir, "push", "origin", "HEAD:main");
  return (await git(worktreeDir, "rev-parse", "HEAD")).trim();
}

/**
 * Commits everything already modified in the worktree (e.g. by the agent's
 * bash session), then pushes. Returns null when the worktree is clean.
 */
export async function commitCaseWorktree(
  rootDir: string,
  slug: string,
  message: string,
  author: CaseAuthor = DAT_AUTHOR,
): Promise<string | null> {
  const { worktreeDir } = casePaths(rootDir, slug);
  const status = await git(worktreeDir, "status", "--porcelain");
  if (!status.trim()) return null;
  await git(worktreeDir, "add", "-A");
  await git(
    worktreeDir,
    "-c",
    `user.name=${author.name}`,
    "-c",
    `user.email=${author.email}`,
    "commit",
    "-m",
    message,
  );
  await git(worktreeDir, "push", "origin", "HEAD:main");
  return (await git(worktreeDir, "rev-parse", "HEAD")).trim();
}

export async function listCaseFiles(
  rootDir: string,
  slug: string,
): Promise<string[]> {
  const { worktreeDir } = casePaths(rootDir, slug);
  const out = await git(worktreeDir, "ls-files", "-z");
  return out.split("\0").filter(Boolean).sort();
}

export async function readCaseFile(
  rootDir: string,
  slug: string,
  filePath: string,
): Promise<string> {
  const { worktreeDir } = casePaths(rootDir, slug);
  const abs = resolveCaseFile(worktreeDir, filePath);
  return readFile(abs, "utf8");
}

export async function caseLog(
  rootDir: string,
  slug: string,
  limit = 20,
): Promise<CaseCommit[]> {
  const { worktreeDir } = casePaths(rootDir, slug);
  let out: string;
  try {
    out = await git(
      worktreeDir,
      "log",
      `-${limit}`,
      "--format=%H%x1f%s%x1f%an%x1f%cI%x1e",
    );
  } catch {
    return [];
  }
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", message = "", authorName = "", date = ""] =
        record.split("\x1f");
      return { sha, message, authorName, date };
    });
}

/** Tags HEAD (used by the agent's checkpoint tool) and pushes the tag. */
export async function tagCaseHead(
  rootDir: string,
  slug: string,
  tag: string,
  message: string,
): Promise<void> {
  const { worktreeDir } = casePaths(rootDir, slug);
  const safeTag = tag.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  if (!safeTag) throw new CasePathError(`Invalid tag name: ${tag}`);
  await git(worktreeDir, "tag", "-f", "-a", safeTag, "-m", message);
  await git(worktreeDir, "push", "-f", "origin", `refs/tags/${safeTag}`);
}

export async function caseHeadSha(
  rootDir: string,
  slug: string,
): Promise<string | null> {
  const { worktreeDir } = casePaths(rootDir, slug);
  try {
    return (await git(worktreeDir, "rev-parse", "HEAD")).trim();
  } catch {
    return null;
  }
}
