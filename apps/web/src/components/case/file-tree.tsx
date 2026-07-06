"use client";

import { FileSpreadsheet, FileText, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function iconFor(path: string) {
  if (path.endsWith(".md")) return FileText;
  if (path.endsWith(".csv")) return FileSpreadsheet;
  return FileIcon;
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
}: {
  files: string[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <nav aria-label="Case files" className="min-h-0 flex-1 overflow-y-auto p-2">
      <h2 className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Files
      </h2>
      <ul className="space-y-0.5">
        {files.map((path) => {
          const Icon = iconFor(path);
          return (
            <li key={path}>
              <button
                type="button"
                onClick={() => onSelect(path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  selectedPath === path
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{path}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
