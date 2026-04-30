"use client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/thread";
import { useChatRuntime } from "@/hooks/usechatruntime";
import { useThreadStore } from "@/hooks/useThreadStore";
import { useThreadTitle } from "@/hooks/useThreadTitle";
import { ThreadListSidebar } from "@/components/threadlist-sidebar";
import { InterruptModal } from "@/components/interrupt-modal";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useCallback, useEffect, useState } from "react";

export const Assistant = () => {
  const { threads, addThread, setTitle, deleteThread, archiveThread, hasTitle } =
    useThreadStore();

  // Active thread — initialize with a fresh UUID and persist it
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());

  // Register the initial thread in the store once hydrated
  useEffect(() => {
    addThread(threadId);
  }, [threadId, addThread]);

  const { generateTitle } = useThreadTitle({ hasTitle, setTitle });

  const handleSwitchToNewThread = useCallback(() => {
    const newId = crypto.randomUUID();
    addThread(newId);
    setThreadId(newId);
  }, [addThread]);

  const handleSwitchToThread = useCallback((id: string) => {
    setThreadId(id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteThread(id);
      if (id === threadId) {
        const remaining = threads.filter((t) => t.id !== id);
        if (remaining.length > 0) {
          setThreadId(remaining[0].id);
        } else {
          const newId = crypto.randomUUID();
          addThread(newId);
          setThreadId(newId);
        }
      }
    },
    [threadId, threads, deleteThread, addThread],
  );

  const handleArchive = useCallback(
    (id: string) => {
      archiveThread(id);
      if (id === threadId) {
        const remaining = threads.filter((t) => t.id !== id);
        if (remaining.length > 0) {
          setThreadId(remaining[0].id);
        } else {
          const newId = crypto.randomUUID();
          addThread(newId);
          setThreadId(newId);
        }
      }
    },
    [threadId, threads, archiveThread, addThread],
  );

  const handleAssistantReply = useCallback(
    (userText: string, assistantText: string) => {
      generateTitle(threadId, userText, assistantText);
    },
    [threadId, generateTitle],
  );

  const { runtime, pendingInterrupt, resumeChat } = useChatRuntime({
    threadId,
    threads,
    onSwitchToNewThread: handleSwitchToNewThread,
    onSwitchToThread: handleSwitchToThread,
    onDeleteThread: handleDelete,
    onArchiveThread: handleArchive,
    onAssistantReply: handleAssistantReply,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full">
          <ThreadListSidebar />
          <SidebarInset>
            <SidebarTrigger className="absolute top-4 left-4" />
            <Thread />
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Human-in-the-loop interrupt popup */}
      <InterruptModal
        interrupt={pendingInterrupt}
        onDecision={resumeChat}
      />
    </AssistantRuntimeProvider>
  );
};

