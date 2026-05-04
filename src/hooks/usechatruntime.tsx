import {
  ChatMessage,
  InterruptPayload,
  ToolCall,
  toThreadMessage,
} from "@/types/chat";
import {
  AppendMessage,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type ExternalStoreThreadListAdapter,
} from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredThread } from "./useThreadStore";

const API_URL = `http://localhost:8000`;

// ── Tool call persistence ─────────────────────────────────────────────────────
// Stores tool calls in localStorage keyed by threadId so they survive thread switches.

function loadToolCalls(threadId: string): Record<string, ToolCall[]> {
  try {
    return JSON.parse(localStorage.getItem(`tool_calls_${threadId}`) ?? "{}");
  } catch {
    return {};
  }
}

function saveToolCalls(threadId: string, map: Record<string, ToolCall[]>) {
  localStorage.setItem(`tool_calls_${threadId}`, JSON.stringify(map));
}

export interface ChatRuntimeOptions {
  threadId: string;
  threads: StoredThread[];
  onSwitchToNewThread: () => void;
  onSwitchToThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
  /** Called after a complete assistant reply so callers can generate a title */
  onAssistantReply?: (userText: string, assistantText: string) => void;
}

export const useChatRuntime = ({
  threadId,
  threads,
  onSwitchToNewThread,
  onSwitchToThread,
  onDeleteThread,
  onArchiveThread,
  onAssistantReply,
}: ChatRuntimeOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] =
    useState<InterruptPayload | null>(null);

  // Track the threadId we last loaded so we reload when it changes
  const loadedThreadRef = useRef<string | null>(null);
  // Track the assistantID that is currently streaming (needed for resume)
  const activeAssistantIdRef = useRef<string | null>(null);

  // Load messages from backend whenever threadId changes
  useEffect(() => {
    if (!threadId || loadedThreadRef.current === threadId) return;
    loadedThreadRef.current = threadId;
    setMessages([]);
    setIsLoading(true);

    fetch(`${API_URL}/api/v1/threads/${threadId}/messages`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        // Index tool result messages by tool_call_id so we can mark calls as done
        // Shape: { [tool_call_id]: "success" | "error" }
        const toolResults: Record<string, "done"> = {};
        for (const m of data.messages ?? []) {
          if (m.type === "tool") {
            const callId = m.data?.tool_call_id ?? m.tool_call_id;
            if (callId) toolResults[callId] = "done";
          }
        }

        const loaded: ChatMessage[] = (data.messages ?? [])
          .map(
            (m: {
              id?: string;
              role?: string;
              type?: string;
              content?: unknown;
              created_at?: number;
              data?: {
                content?: unknown;
                id?: string;
                tool_calls?: {
                  name: string;
                  args: Record<string, unknown>;
                  id: string;
                }[];
              };
            }) => {
              const raw = m.role ?? m.type ?? "";
              const role: "user" | "assistant" | null =
                raw === "user" || raw === "human"
                  ? "user"
                  : raw === "assistant" || raw === "ai"
                    ? "assistant"
                    : null;
              if (!role) return null; // skip tool messages — they're folded into pills

              const innerData = m.data;
              const rawContent = m.content ?? innerData?.content;
              const id = m.id ?? innerData?.id ?? crypto.randomUUID();

              let content = "";
              if (typeof rawContent === "string") {
                content = rawContent;
              } else if (Array.isArray(rawContent)) {
                content = rawContent
                  .map((block: unknown) =>
                    typeof block === "string"
                      ? block
                      : typeof (block as { text?: string }).text === "string"
                        ? (block as { text: string }).text
                        : "",
                  )
                  .join("");
              }

              // Reconstruct tool call pills from LangChain's tool_calls array
              let toolCalls: ToolCall[] | undefined;
              const lcToolCalls = innerData?.tool_calls;
              if (
                role === "assistant" &&
                Array.isArray(lcToolCalls) &&
                lcToolCalls.length > 0
              ) {
                toolCalls = lcToolCalls.map((tc) => ({
                  id: tc.id ?? crypto.randomUUID(),
                  tool: tc.name,
                  input: tc.args ?? {},
                  // If a tool result message exists for this call id → done, else done anyway
                  // (history is always complete — no call is mid-flight on reload)
                  status: "done" as const,
                }));
              }

              return {
                id,
                role,
                content,
                createdAt: m.created_at
                  ? new Date(m.created_at * 1000)
                  : new Date(),
                ...(toolCalls ? { toolCalls } : {}),
              };
            },
          )
          .filter(Boolean) as ChatMessage[];

        setMessages(loaded);
      })
      .catch((err) => console.error("Failed to load thread messages:", err))
      .finally(() => setIsLoading(false));
  }, [threadId]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const user_id = localStorage.getItem("user_id")
      const userText = message.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("");

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: userText,
        role: "user",
        createdAt: new Date(),
      };

      const assistantID = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantID,
        content: "",
        role: "assistant",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsRunning(true);
      activeAssistantIdRef.current = assistantID;

      let fullAssistantText = "";

      try {
        const response = await fetch(`${API_URL}/api/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, query: userText , user_id }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const raw of events) {
            const event = parseSSEEvent(raw);
            if (!event) continue;
            if (event.type === "text") {
              fullAssistantText += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantID
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "interrupt") {
              // Mark any still-running tools as interrupted so they don't spin forever
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantID) return m;
                  const toolCalls = (m.toolCalls ?? []).map((tc) =>
                    tc.status === "running"
                      ? { ...tc, status: "interrupted" as const }
                      : tc,
                  );
                  
                  return { ...m, toolCalls };
                }),
              );
              // Surface the popup — isRunning stays true (graph is paused, not done)
              setPendingInterrupt(event as unknown as InterruptPayload);
              console.log("Pending interrupt : " , event)
              break; // stop reading; resume will open a new SSE stream
            } else if (event.type === "tool_start") {
              const newTool: ToolCall = {
                id: crypto.randomUUID(),
                tool: event.tool ?? "",
                input: event.input ?? {},
                status: "running",
              };
              setMessages((prev) => {
                const next = prev.map((m) =>
                  m.id === assistantID
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), newTool] }
                    : m,
                );
                const updated = next.find((m) => m.id === assistantID);
                if (updated?.toolCalls) {
                  const map = loadToolCalls(threadId);
                  map[assistantID] = updated.toolCalls;
                  saveToolCalls(threadId, map);
                }
                return next;
              });
            } else if (event.type === "tool_end") {
              setMessages((prev) => {
                const next = prev.map((m) => {
                  if (m.id !== assistantID) return m;
                  const toolCalls = (m.toolCalls ?? []).map((tc) =>
                    tc.tool === event.tool && tc.status === "running"
                      ? { ...tc, status: "done" as const }
                      : tc,
                  );
                  return { ...m, toolCalls };
                });
                const updated = next.find((m) => m.id === assistantID);
                if (updated?.toolCalls) {
                  const map = loadToolCalls(threadId);
                  map[assistantID] = updated.toolCalls;
                  saveToolCalls(threadId, map);
                }
                return next;
              });
            } else if (event.type === "error") {
              console.error("Stream error:", event.content);
              break;
            }
          }
        }

        // Notify parent so it can generate a title if this thread has none yet
        if (fullAssistantText && onAssistantReply) {
          onAssistantReply(userText, fullAssistantText);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Chat error:", err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantID
                ? { ...m, content: "Something went wrong. Please try again." }
                : m,
            ),
          );
        }
      } finally {
        // Keep isRunning=true if an interrupt is pending — the graph is paused,
        // not finished. resumeChat() flips it false when done.
        setPendingInterrupt((current) => {
          if (!current) setIsRunning(false);
          return current;
        });
      }
    },
    [threadId, onAssistantReply],
  );

  const resumeChat = useCallback(
    async (decision: "yes" | "no") => {
      const assistantID = activeAssistantIdRef.current;
      setPendingInterrupt(null);

      try {
        const response = await fetch(`${API_URL}/api/v1/chat/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, decision }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const raw of events) {
            const event = parseSSEEvent(raw);
            if (!event) continue;

            if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantID
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "tool_start") {
              const newTool: ToolCall = {
                id: crypto.randomUUID(),
                tool: event.tool ?? "",
                input: event.input ?? {},
                status: "running",
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantID
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []).filter(
                            (tc) => tc.status !== "interrupted",
                          ),
                          newTool,
                        ],
                      }
                    : m,
                ),
              );
            } else if (event.type === "tool_end") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantID) return m;
                  const toolCalls = (m.toolCalls ?? []).map((tc) =>
                    tc.tool === event.tool && tc.status === "running"
                      ? { ...tc, status: "done" as const }
                      : tc,
                  );
                  return { ...m, toolCalls };
                }),
              );
            } else if (event.type === "interrupt") {
              // Another interrupt in the same turn
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantID) return m;
                  const toolCalls = (m.toolCalls ?? []).map((tc) =>
                    tc.status === "running"
                      ? { ...tc, status: "interrupted" as const }
                      : tc,
                  );
                  return { ...m, toolCalls };
                }),
              );
              setPendingInterrupt(event as unknown as InterruptPayload);
              return;
            } else if (event.type === "done") {
              break;
            }
          }
        }
      } catch (err) {
        console.error("Resume error:", err);
      } finally {
        // Only set done if no nested interrupt was triggered
        setPendingInterrupt((current) => {
          if (!current) setIsRunning(false);
          return current;
        });
      }
    },
    [threadId],
  );

  // Build the threadList adapter from props
  const threadListAdapter: ExternalStoreThreadListAdapter = {
    threadId,
    isLoading,
    threads: threads.map((t) => ({
      status: "regular" as const,
      id: t.id,
      title: t.title || undefined,
    })),
    onSwitchToNewThread,
    onSwitchToThread,
    onDelete: onDeleteThread,
    onArchive: onArchiveThread,
  };

  const threadMessages: ThreadMessageLike[] = messages.map(toThreadMessage);

  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    isRunning,
    onNew,
    onEdit: async (message) => {
      const idx = messages.findIndex((m) => m.id === message.parentId);
      setMessages((prev) => prev.slice(0, idx + 1));
      await onNew(message);
    },
    convertMessage: (m) => m,
    adapters: {
      threadList: threadListAdapter,
    },
  });

  return { runtime, pendingInterrupt, resumeChat };
};

// ── SSE parser ────────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  content: string;
  tool?: string;
  input?: Record<string, unknown>;
  value?: Record<string, unknown>;
}

function parseSSEEvent(raw: string): SSEEvent | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let type = "message";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) dataStr = line.slice(5).trim();
  }

  if (!dataStr) return null;

  try {
    const parsed = JSON.parse(dataStr);
    if (parsed.type === "interrupt"){
      return {
        type : "interrupt",
        content : "",
        value : parsed.value
      }
    }
    return {
      type: parsed.type ?? type,
      content: parsed.content != null ? String(parsed.content) : "",
      tool: parsed.tool,
      input: parsed.input,
    };
  } catch {
    return { type, content: dataStr };
  }
}
