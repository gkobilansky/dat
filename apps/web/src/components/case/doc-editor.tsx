"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc";

export function DocEditor({
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
  const [content, setContent] = useState(initialContent);
  const dirty = content !== initialContent;

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-mono text-sm text-muted-foreground">{path}</span>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : save.isSuccess ? "Saved" : ""}
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate({ caseId, files: [{ path, content }] })
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
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label={`Edit ${path}`}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-sm leading-6 outline-none"
      />
    </div>
  );
}
