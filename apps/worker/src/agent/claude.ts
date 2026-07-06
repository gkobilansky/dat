import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { casePaths, commitCaseWorktree, tagCaseHead } from "@dat/storage";
import type { AgentContext } from "./types";

/**
 * The agent's bash inherits this instead of the worker env, so DB/Redis/S3
 * credentials never reach agent-run commands. Full isolation (no network,
 * memory/time limits) arrives with the per-case Docker sandbox.
 */
function agentEnv(): Record<string, string> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["PATH", "HOME", "USER", "SHELL", "LANG", "TMPDIR", "ANTHROPIC_API_KEY"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

const SYSTEM_PROMPT = `You are Dat, an analysis agent embedded in a case workspace.
You work inside the case's git worktree (your current directory).

Rules:
- Documents are Markdown (.md); spreadsheets are CSV (.csv) with an optional
  .univer.json sidecar for formulas/formatting. Keep files in these formats.
- Use bash for all file and git work. Commit your progress with git as you go,
  with clear messages prefixed "Dat:".
- Use request_approval before any destructive or outward-facing step.
- Use checkpoint to record named milestones.
- Keep replies concise and reference files you created or changed.`;

/** Runs the Claude Agent SDK against the case worktree. */
export async function runClaudeAgent(ctx: AgentContext): Promise<string> {
  const { rootDir, slug, progress } = ctx;
  const { worktreeDir } = casePaths(rootDir, slug);

  const datServer = createSdkMcpServer({
    name: "dat",
    version: "0.1.0",
    tools: [
      tool(
        "request_approval",
        "Ask the user to approve a destructive or outward-facing step before taking it.",
        { summary: z.string().describe("What you want to do and why") },
        async ({ summary }) => {
          await progress({ type: "status", text: `Approval requested: ${summary}` });
          // Interactive sign-off ships with multi-user auth; dev auto-approves.
          return {
            content: [{ type: "text", text: "Approved (dev auto-approval)." }],
          };
        },
      ),
      tool(
        "checkpoint",
        "Record a named milestone in the case timeline (creates a git tag).",
        {
          name: z.string().describe("Short milestone name"),
          description: z.string().optional(),
        },
        async ({ name, description }) => {
          const message = `Checkpoint: ${name}`;
          const sha = await commitCaseWorktree(rootDir, slug, message);
          await tagCaseHead(rootDir, slug, name, description ?? name);
          if (sha) await progress({ type: "commit", sha, message });
          await progress({ type: "status", text: `Checkpoint recorded: ${name}` });
          return {
            content: [{ type: "text", text: `Checkpoint "${name}" recorded.` }],
          };
        },
      ),
    ],
  });

  const run = query({
    prompt: ctx.userMessage,
    options: {
      cwd: worktreeDir,
      env: agentEnv(),
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: ["Bash", "mcp__dat__request_approval", "mcp__dat__checkpoint"],
      // Acceptable only because claude mode is an explicit opt-in until the
      // Docker sandbox provides the real isolation boundary (PLAN.md §5).
      permissionMode: "bypassPermissions",
      mcpServers: { dat: datServer },
      settingSources: [],
      maxTurns: 50,
    },
  });

  let reply = "";
  for await (const message of run) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          await progress({ type: "token", text: block.text });
        } else if (block.type === "tool_use") {
          await progress({
            type: "tool",
            name: block.name,
            summary: JSON.stringify(block.input).slice(0, 200),
          });
        }
      }
    } else if (message.type === "result") {
      if (message.subtype !== "success") {
        throw new Error(`Agent run failed: ${message.subtype}`);
      }
      reply = message.result;
    }
  }

  const finalMessage = "Dat: task work";
  const sha = await commitCaseWorktree(rootDir, slug, finalMessage);
  if (sha) await progress({ type: "commit", sha, message: finalMessage });

  return reply || "Task complete.";
}
