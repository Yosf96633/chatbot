import type { ThreadMessageLike } from "@assistant-ui/react";

export type MessageRole = "user" | "assistant";

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  status: "running" | "done" | "interrupted";
}

export interface InterruptPayload {
  type: "interrupt";
  id: string;
  value: {
    question: string;
    subject?: string;
    body?: string;
    [key: string]: unknown;
  };
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  toolCalls?: ToolCall[];
}

// Converts your internal message → assistant-ui's format
export function toThreadMessage(msg: ChatMessage): ThreadMessageLike {
  return {
    id: msg.id,
    role: msg.role,           // "user" | "assistant"  ← already correct
    content: [{ type: "text", text: msg.content }],
    createdAt: msg.createdAt,
    // Pass toolCalls in metadata so our custom renderer can access them
    metadata: { custom: { toolCalls: msg.toolCalls ?? [] } },
  };
}