"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { FileTree } from "./file-tree";
import { EditorPane } from "./editor-pane";
import { ChatPanel } from "./chat-panel";
import { Timeline } from "./timeline";

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const kase = useQuery(trpc.case.get.queryOptions({ id: caseId }));
  const files = useQuery(trpc.file.list.queryOptions({ caseId }));

  useEffect(() => {
    if (!files.data || files.data.length === 0) return;
    if (selectedPath && files.data.includes(selectedPath)) return;
    setSelectedPath(
      files.data.includes("notes.md") ? "notes.md" : files.data[0]!,
    );
  }, [files.data, selectedPath]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.file.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.file.read.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.case.timeline.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.message.list.queryKey() }),
    ]);
  }, [queryClient, trpc]);

  if (kase.isError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Case not found.</p>
        <Link className="text-sm underline" href="/">
          Back to cases
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Cases
        </Link>
        <span className="text-border">/</span>
        <h1 className="truncate font-medium">{kase.data?.title ?? "…"}</h1>
        {kase.data ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {kase.data.repoSlug}
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border">
          <FileTree
            files={files.data ?? []}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
          <Timeline caseId={caseId} />
        </aside>

        <main className="min-w-0 flex-1">
          {selectedPath ? (
            <EditorPane caseId={caseId} path={selectedPath} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {files.isLoading ? "Loading files…" : "Select a file"}
            </div>
          )}
        </main>

        <aside className="flex w-96 shrink-0 flex-col border-l border-border">
          <ChatPanel caseId={caseId} onAgentDone={refreshWorkspace} />
        </aside>
      </div>
    </div>
  );
}
