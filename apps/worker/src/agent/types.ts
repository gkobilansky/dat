import type { AgentProgressEvent } from "@dat/shared";

export interface AgentContext {
  rootDir: string;
  slug: string;
  caseId: string;
  userMessage: string;
  progress: (event: AgentProgressEvent) => Promise<void>;
}

/** Runs one agent task against the case worktree; returns the reply text. */
export type AgentRunner = (ctx: AgentContext) => Promise<string>;
