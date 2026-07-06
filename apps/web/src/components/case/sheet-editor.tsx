"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { parseCsv, serializeCsv } from "@dat/shared";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc";

function normalize(rows: string[][]): string[][] {
  const width = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => [
    ...row,
    ...Array.from({ length: width - row.length }, () => ""),
  ]);
}

export function SheetEditor({
  caseId,
  path,
  initialContent,
}: {
  caseId: string;
  path: string;
  initialContent: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initialRows = useMemo(
    () => normalize(parseCsv(initialContent)),
    [initialContent],
  );
  const [rows, setRows] = useState<string[][]>(initialRows);
  const dirty = serializeCsv(rows) !== serializeCsv(initialRows);

  const save = useMutation(
    trpc.file.save.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.file.read.queryKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.case.timeline.queryKey() }),
        ]);
      },
    }),
  );

  const setCell = (r: number, c: number, value: string) => {
    setRows((prev) =>
      prev.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row,
      ),
    );
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      Array.from({ length: prev[0]?.length ?? 1 }, () => ""),
    ]);

  const addColumn = () => setRows((prev) => prev.map((row) => [...row, ""]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-mono text-sm text-muted-foreground">{path}</span>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : save.isSuccess ? "Saved" : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus data-icon="inline-start" />
            Row
          </Button>
          <Button size="sm" variant="outline" onClick={addColumn}>
            <Plus data-icon="inline-start" />
            Column
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate({
                caseId,
                files: [{ path, content: serializeCsv(rows) }],
              })
            }
          >
            <Save data-icon="inline-start" />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {save.isError ? (
        <p className="border-b border-border px-4 py-2 text-sm text-destructive">
          {save.error.message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <table className="border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-border p-0">
                    <input
                      value={cell}
                      onChange={(event) => setCell(r, c, event.target.value)}
                      aria-label={`Cell ${r + 1},${c + 1}`}
                      className={
                        "h-8 w-40 bg-background px-2 font-mono text-sm outline-none focus-visible:bg-muted " +
                        (r === 0 ? "font-semibold" : "")
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
