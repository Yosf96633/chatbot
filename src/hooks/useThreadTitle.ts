/**
 * useThreadTitle
 * Fetches a title from the backend for a given thread after the first exchange,
 * then animates it into the thread store with a typewriter effect.
 */
import { useCallback, useRef } from "react";

const API_URL = `http://localhost:8000`;
const TYPEWRITER_INTERVAL_MS = 40;

interface Options {
  hasTitle: (threadId: string) => boolean;
  setTitle: (threadId: string, title: string) => void;
}

export function useThreadTitle({ hasTitle, setTitle }: Options) {
  // Tracks threads currently being titled so we don't double-fetch
  const inFlight = useRef<Set<string>>(new Set());

  const generateTitle = useCallback(
    async (threadId: string, userQuery: string, aiResponse: string) => {
      if (hasTitle(threadId)) return;
      if (inFlight.current.has(threadId)) return;
      inFlight.current.add(threadId);

      try {
        const res = await fetch(`${API_URL}/api/v1/thread-title-generator`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            user_query: userQuery,
            ai_response: aiResponse,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const fullTitle: string = data.title ?? "";
        if (!fullTitle) return;

        // Typewriter: reveal one character at a time
        let i = 0;
        const tick = () => {
          i++;
          setTitle(threadId, fullTitle.slice(0, i));
          if (i < fullTitle.length) {
            setTimeout(tick, TYPEWRITER_INTERVAL_MS);
          }
        };
        tick();
      } catch (err) {
        console.error("Title generation failed:", err);
      } finally {
        inFlight.current.delete(threadId);
      }
    },
    [hasTitle, setTitle],
  );

  return { generateTitle };
}
