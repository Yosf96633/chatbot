"use client";

import { CheckIcon, ClockIcon, WrenchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/types/chat";

interface ToolCallUIProps {
  toolCalls: ToolCall[];
}

export function ToolCallUI({ toolCalls }: ToolCallUIProps) {
  if (!toolCalls.length) return null;

  return (
    <div className="mb-3 flex flex-col gap-2">
      {toolCalls.map((tc) => (
        <ToolCallBadge key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const isRunning = toolCall.status === "running";
  const isInterrupted = toolCall.status === "interrupted";

  return (
    <div
      className={cn(
        "relative inline-flex w-fit items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5 text-sm",
        isRunning
          ? "border-border bg-muted text-muted-foreground"
          : isInterrupted
          ? "border-amber-300/50 bg-amber-50/50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {/* shimmer overlay while running */}
      {isRunning && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
        />
      )}

      {isRunning ? (
        <WrenchIcon className="size-3.5 shrink-0 animate-pulse" />
      ) : isInterrupted ? (
        <ClockIcon className="size-3.5 shrink-0" />
      ) : (
        <CheckIcon className="size-3.5 shrink-0 text-green-500" />
      )}

      <span className="font-medium">
        {isRunning ? "Running" : isInterrupted ? "Awaiting approval —" : "Used"}{" "}
        <span className="font-semibold">{toolCall.tool}</span>
      </span>

      {!isRunning && Object.keys(toolCall.input).length > 0 && (
        <span className="ml-1 text-xs text-muted-foreground/70">
          ({formatInput(toolCall.input)})
        </span>
      )}
    </div>
  );
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (!entries.length) return "";
  // Show first key=value pair, truncate if too long
  const [key, val] = entries[0];
  const str = `${key}: ${String(val)}`;
  return str.length > 30 ? str.slice(0, 30) + "…" : str;
}