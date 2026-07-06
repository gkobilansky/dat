"use client";

import { useQuery } from "@tanstack/react-query";
import { GitCommitHorizontal } from "lucide-react";
import { useTRPC } from "@/lib/trpc";

export function Timeline({ caseId }: { caseId: string }) {
  const trpc = useTRPC();
  const timeline = useQuery(
    trpc.case.timeline.queryOptions({ id: caseId, limit: 15 }),
  );

  return (
    <section
      aria-label="Case timeline"
      className="max-h-72 shrink-0 overflow-y-auto border-t border-border p-2"
    >
      <h2 className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Timeline
      </h2>
      <ul className="space-y-1">
        {timeline.data?.map((commit) => (
          <li key={commit.sha} className="flex items-start gap-2 px-2 py-1">
            <GitCommitHorizontal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-xs">{commit.message}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {commit.sha.slice(0, 7)} · {commit.authorName}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
