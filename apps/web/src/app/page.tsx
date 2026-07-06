"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc";

export default function HomePage() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const cases = useQuery(trpc.case.list.queryOptions());
  const createCase = useMutation(
    trpc.case.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: trpc.case.list.queryKey() });
        router.push(`/cases/${created.id}`);
      },
    }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Dat</h1>
        <p className="mt-1 text-muted-foreground">
          Case workspace — documents, spreadsheets, and an agent that works with you.
        </p>
      </header>

      <form
        className="mb-8 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && !createCase.isPending) {
            createCase.mutate({ title });
          }
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New case title…"
          aria-label="New case title"
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="lg" disabled={!title.trim() || createCase.isPending}>
          <Plus data-icon="inline-start" />
          {createCase.isPending ? "Creating…" : "Create case"}
        </Button>
      </form>
      {createCase.isError ? (
        <p className="mb-6 text-sm text-destructive">{createCase.error.message}</p>
      ) : null}

      <section aria-label="Cases" className="space-y-2">
        {cases.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading cases…</p>
        ) : null}
        {cases.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cases yet. Create your first one above.
          </p>
        ) : null}
        {cases.data?.map((kase) => (
          <Link
            key={kase.id}
            href={`/cases/${kase.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
          >
            <FolderGit2 className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{kase.title}</div>
              <div className="text-xs text-muted-foreground">
                {kase._count.messages} messages · updated{" "}
                {new Date(kase.updatedAt).toLocaleString()}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{kase.status}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
