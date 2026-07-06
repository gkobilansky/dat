export * from "./csv";

export const AGENT_QUEUE = "agent-tasks";

export function progressChannel(caseId: string): string {
  return `case:${caseId}:progress`;
}

export type AgentJob =
  | { kind: "user-message"; caseId: string; messageId: string }
  | { kind: "file-change"; caseId: string; paths: string[] };

export type AgentProgressEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "commit"; sha: string; message: string }
  | { type: "done"; ok: boolean; error?: string };
