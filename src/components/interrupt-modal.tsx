"use client";

import { useEffect, useRef } from "react";
import type { InterruptPayload } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MailIcon, XIcon } from "lucide-react";

interface InterruptModalProps {
  interrupt: InterruptPayload | null;
  onDecision: (decision: "yes" | "no") => void;
}

export function InterruptModal({ interrupt, onDecision }: InterruptModalProps) {
  const yesRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when modal opens
  useEffect(() => {
    if (interrupt) {
      setTimeout(() => yesRef.current?.focus(), 50);
    }
  }, [interrupt]);

  if (!interrupt) return null;

  const { value } = interrupt;
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => onDecision("no")}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="interrupt-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border border-border bg-background shadow-2xl",
          "animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <MailIcon className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2
                id="interrupt-title"
                className="text-sm font-semibold text-foreground"
              >
                Action Required
              </h2>
              <p className="text-xs text-muted-foreground">
                Claude needs your approval to continue
              </p>
            </div>
          </div>
          <button
            onClick={() => onDecision("no")}
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Question */}
        <div className="px-6 py-4">
          <p className="text-sm font-medium text-foreground">
            {value.question ?? "Do you want to proceed?"}
          </p>
        </div>

        {/* Email preview — shown if subject/body present */}
        {(value.subject || value.body) && (
          <div className="mx-6 mb-4 rounded-xl border border-border bg-muted/50 overflow-hidden">
            {value.subject && (
              <div className="border-b border-border px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Subject
                </span>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {String(value.subject)}
                </p>
              </div>
            )}
            {value.body && (
              <div className="px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Message
                </span>
                <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                  {String(value.body)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Any other fields (generic key-value) */}
        {Object.entries(value)
          .filter(
            ([k]) =>
              !["question", "subject", "body"].includes(k),
          )
          .map(([k, v]) => (
            <div key={k} className="mx-6 mb-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground capitalize">
                {k}
              </span>
              <p className="mt-0.5 text-sm text-foreground">{String(v)}</p>
            </div>
          ))}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDecision("no")}
            className="rounded-full px-4"
          >
            Cancel
          </Button>
          <Button
            ref={yesRef}
            size="sm"
            onClick={() => onDecision("yes")}
            className="rounded-full px-4 bg-foreground text-background hover:bg-foreground/90"
          >
            Confirm
          </Button>
        </div>
      </div>
    </>
  );
}