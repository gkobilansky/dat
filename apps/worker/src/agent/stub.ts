import {
  commitCaseFiles,
  listCaseFiles,
  readCaseFile,
} from "@dat/storage";
import type { AgentContext } from "./types";

interface CsvSummary {
  path: string;
  rows: number;
  columns: string[];
  totals: Record<string, number>;
}

function summarizeCsv(path: string, content: string): CsvSummary {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines[0]?.split(",").map((cell) => cell.trim()) ?? [];
  const dataRows = lines.slice(1).map((line) => line.split(","));
  const totals: Record<string, number> = {};
  header.forEach((column, index) => {
    let sum = 0;
    let numeric = 0;
    for (const row of dataRows) {
      const value = Number(row[index]?.trim());
      if (row[index] !== undefined && row[index]!.trim() !== "" && !Number.isNaN(value)) {
        sum += value;
        numeric += 1;
      }
    }
    if (numeric > 0 && numeric === dataRows.length) totals[column] = sum;
  });
  return { path, rows: dataRows.length, columns: header, totals };
}

/**
 * Deterministic offline agent: reads the worktree, writes a case summary,
 * and commits it. Exercises the full task pipeline without the Claude API.
 */
export async function runStubAgent(ctx: AgentContext): Promise<string> {
  const { rootDir, slug, userMessage, progress } = ctx;

  await progress({ type: "status", text: "Reviewing case files" });
  // Excluding its own analysis output keeps repeat runs from re-committing.
  const files = (await listCaseFiles(rootDir, slug)).filter(
    (file) => !file.startsWith("analysis/"),
  );
  await progress({ type: "tool", name: "bash", summary: "git ls-files" });

  const csvSummaries: CsvSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".csv")) continue;
    const content = await readCaseFile(rootDir, slug, file);
    csvSummaries.push(summarizeCsv(file, content));
    await progress({ type: "tool", name: "bash", summary: `analyze ${file}` });
  }

  const summaryLines = [
    "# Case summary",
    "",
    `Prepared by Dat in response to: "${userMessage.slice(0, 200)}"`,
    "",
    `Tracked files (${files.length}):`,
    ...files.map((file) => `- ${file}`),
    "",
  ];
  for (const csv of csvSummaries) {
    summaryLines.push(`## ${csv.path}`);
    summaryLines.push("");
    summaryLines.push(`- Rows: ${csv.rows}`);
    summaryLines.push(`- Columns: ${csv.columns.join(", ") || "(none)"}`);
    for (const [column, total] of Object.entries(csv.totals)) {
      summaryLines.push(`- Total ${column}: ${total}`);
    }
    summaryLines.push("");
  }

  await progress({ type: "status", text: "Writing analysis/summary.md" });
  const commitMessage = "Dat: update case summary";
  const sha = await commitCaseFiles(
    rootDir,
    slug,
    [{ path: "analysis/summary.md", content: summaryLines.join("\n") }],
    commitMessage,
  );
  if (sha) {
    await progress({ type: "commit", sha, message: commitMessage });
  }

  const csvNote =
    csvSummaries.length > 0
      ? ` I analyzed ${csvSummaries.length} spreadsheet${csvSummaries.length === 1 ? "" : "s"} (${csvSummaries
          .map((c) => `${c.path}: ${c.rows} rows`)
          .join("; ")}).`
      : "";
  return `I reviewed ${files.length} files in this case.${csvNote} A summary is committed at analysis/summary.md.`;
}
