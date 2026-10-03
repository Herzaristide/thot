"use client";

import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type LiveState = "connecting" | "open" | "closed";

/**
 * Flux SSE de la Corpus API (/v1/admin/stream, via le BFF) : chaque
 * événement invalide les requêtes concernées, qui se rechargent si elles
 * sont affichées. EventSource se reconnecte seul (`retry` envoyé par l'API).
 */
export function useLiveUpdates(): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/corpus/v1/admin/stream");
    let pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      invalidate(qc, pending);
      pending = new Set();
      timer = null;
    };
    // Regroupe les rafales (un lot de 50 dépôts = 50 notifications)
    const schedule = (keys: string[]) => {
      for (const k of keys) pending.add(k);
      timer ??= setTimeout(flush, 400);
    };
    source.onopen = () => setState("open");
    source.onerror = () =>
      setState(source.readyState === EventSource.CLOSED ? "closed" : "connecting");
    source.addEventListener("job", (e) => {
      const job = JSON.parse((e as MessageEvent).data) as { id: string };
      schedule(["overview", "jobs", `job:${job.id}`, "workers"]);
    });
    source.addEventListener("corpus", () => {
      schedule([
        "overview",
        "works",
        "work",
        "quality",
        "alignment",
        "events",
        "trash",
        "structure",
      ]);
    });
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [qc]);

  return state;
}

function invalidate(qc: QueryClient, keys: Set<string>) {
  for (const key of keys) {
    if (key.startsWith("job:")) {
      void qc.invalidateQueries({ queryKey: ["job", key.slice(4)] });
    } else {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }
}
