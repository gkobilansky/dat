"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { Loader2, SendHorizonal } from "lucide-react";
import type { AgentProgressEvent } from "@dat/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/lib/trpc";

function activityLine(event: AgentProgressEvent): string | null {
  switch (event.type) {
    case "status":
      return event.text;
    case "tool":
      return `${event.name} · ${event.summary}`;
    case "commit":
      return `commit ${event.sha.slice(0, 7)} · ${event.message}`;
    default:
      return null;
  }
}

export function ChatPanel({
  caseId,
  onAgentDone,
}: {
  caseId: string;
  onAgentDone: () => Promise<void> | void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(trpc.message.list.queryOptions({ caseId }));

  useSubscription(
    trpc.progress.onCaseProgress.subscriptionOptions(
      { caseId },
      {
        onData: (event) => {
          if (event.type === "done") {
            setRunning(false);
            setActivity([]);
            setAgentError(event.ok ? null : (event.error ?? "Agent run failed"));
            void onAgentDone();
            return;
          }
          setRunning(true);
          setAgentError(null);
          const line = activityLine(event);
          if (line) {
            setActivity((prev) => [...prev.slice(-19), line]);
          }
        },
      },
    ),
  );

  const send = useMutation(
    trpc.message.send.mutationOptions({
      onSuccess: async () => {
        setDraft("");
        setRunning(true);
        await queryClient.invalidateQueries({
          queryKey: trpc.message.list.queryKey({ caseId }),
        });
      },
    }),
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.data, activity, running]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Chat with Dat">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-sm font-medium">Chat</h2>
        {running ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Dat is working…
          </span>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.data?.map((message) => (
          <div
            key={message.id}
            data-role={message.role}
            className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
              message.role === "USER"
                ? "ml-auto bg-primary text-primary-foreground"
                : message.role === "AGENT"
                  ? "bg-muted"
                  : "mx-auto text-xs text-muted-foreground",
            )}
          >
            {message.content}
          </div>
        ))}

        {running ? (
          <div className="rounded-xl border border-dashed border-border p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Agent activity
            </div>
            <ul className="space-y-1">
              {activity.slice(-6).map((line, index) => (
                <li key={index} className="truncate font-mono text-xs text-muted-foreground">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {agentError ? (
          <p className="text-xs text-destructive">Agent error: {agentError}</p>
        ) : null}
      </div>

      <form
        className="flex shrink-0 gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() && !send.isPending) {
            send.mutate({ caseId, content: draft.trim() });
          }
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Dat…"
          aria-label="Message Dat"
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="lg" disabled={!draft.trim() || send.isPending}>
          <SendHorizonal />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
