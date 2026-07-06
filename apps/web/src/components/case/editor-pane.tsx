"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { DocEditor } from "./doc-editor";
import { SheetEditor } from "./sheet-editor";

export function EditorPane({ caseId, path }: { caseId: string; path: string }) {
  const trpc = useTRPC();
  const file = useQuery(trpc.file.read.queryOptions({ caseId, path }));

  if (file.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading {path}…
      </div>
    );
  }
  if (file.isError || !file.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Failed to load {path}
      </div>
    );
  }

  const key = `${path}@${file.data.sha ?? "head"}`;
  if (path.endsWith(".md")) {
    return <DocEditor key={key} caseId={caseId} path={path} initialContent={file.data.content} />;
  }
  if (path.endsWith(".csv")) {
    return <SheetEditor key={key} caseId={caseId} path={path} initialContent={file.data.content} />;
  }
  return (
    <div className="h-full overflow-auto">
      <pre className="p-4 font-mono text-sm whitespace-pre-wrap">{file.data.content}</pre>
    </div>
  );
}
