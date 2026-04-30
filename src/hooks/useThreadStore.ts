/**
 * useThreadStore
 * Manages the list of threads in localStorage.
 * Shape stored: { id, title, createdAt }[]
 */
import { useCallback, useEffect, useState } from "react";

const LS_KEY = "chat_threads";

export interface StoredThread {
  id: string;
  title: string;
  createdAt: number; // epoch ms
}

function load(): StoredThread[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(threads: StoredThread[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(threads));
}

export function useThreadStore() {
  const [threads, setThreads] = useState<StoredThread[]>([]);

  // Hydrate from localStorage once on mount (avoids SSR mismatch)
  useEffect(() => {
    setThreads(load());
  }, []);

  const persist = useCallback((next: StoredThread[]) => {
    save(next);
    setThreads(next);
  }, []);

  const addThread = useCallback(
    (id: string) => {
      const existing = load();
      if (existing.find((t) => t.id === id)) return;
      persist([{ id, title: "", createdAt: Date.now() }, ...existing]);
    },
    [persist],
  );

  const setTitle = useCallback(
    (id: string, title: string) => {
      const existing = load();
      persist(existing.map((t) => (t.id === id ? { ...t, title } : t)));
    },
    [persist],
  );

  const deleteThread = useCallback(
    (id: string) => {
      persist(load().filter((t) => t.id !== id));
    },
    [persist],
  );

  const archiveThread = useCallback(
    (id: string) => {
      // No real archive without auth; just delete for now
      deleteThread(id);
    },
    [deleteThread],
  );

  const hasTitle = useCallback((id: string) => {
    return load().find((t) => t.id === id)?.title !== "";
  }, []);

  return { threads, addThread, setTitle, deleteThread, archiveThread, hasTitle };
}
