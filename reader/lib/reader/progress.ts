"use client";

import { useCallback, useEffect, useRef } from "react";
import { localDb, type ProgressBody } from "@/lib/offline/db";
import { send } from "@/lib/offline/outbox";
import { approxSeq, makeQuote, progressOf } from "./anchor";

export type ReadingPosition = {
  seq: number;
  offset: number;
  text: string;
  charStart: number;
  path: string[];
};

/**
 * Progression : écrite dans IndexedDB à chaque changement, envoyée au
 * serveur toutes les ~5 s et quand la page est masquée ou fermée
 * (fetch `keepalive`, l'équivalent de sendBeacon avec un PUT JSON).
 */
export function useProgressSync(opts: {
  editionId: string;
  workId: string;
  revision: number;
  charLength: number;
  signedIn: boolean;
  startedAt: string | null;
}) {
  const latest = useRef<ProgressBody | null>(null);
  const sentAt = useRef<string | null>(null);
  const startedAt = useRef(opts.startedAt ?? new Date().toISOString());
  const { editionId, workId, revision, charLength, signedIn } = opts;

  const flush = useCallback(
    async (keepalive = false) => {
      const body = latest.current;
      if (!signedIn || !body || body.updatedAt === sentAt.current) return;
      sentAt.current = body.updatedAt;
      await send("PUT", `/api/me/progress/${workId}`, body, {
        key: `progress:${workId}`,
        keepalive,
      });
    },
    [workId, signedIn],
  );

  const report = useCallback(
    (pos: ReadingPosition) => {
      const progress = progressOf({ char_start: pos.charStart }, pos.offset, charLength);
      const body: ProgressBody = {
        editionId,
        revision,
        seq: pos.seq,
        offset: pos.offset,
        quote: makeQuote(pos.text, pos.offset),
        progress,
        sectionPath: pos.path,
        startedAt: startedAt.current,
        updatedAt: new Date().toISOString(),
        finishedAt: progress >= 0.995 ? new Date().toISOString() : null,
      };
      latest.current = body;
      void localDb()?.workProgress.put({ workId, body });
    },
    [charLength, editionId, revision, workId],
  );

  useEffect(() => {
    const timer = setInterval(() => void flush(), 5000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onPageHide = () => void flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      void flush(true);
    };
  }, [flush]);

  /** `flush` : envoie tout de suite (avant de quitter la liseuse, par exemple). */
  return { report, flush };
}

/**
 * Dernière position gardée sur cet appareil pour l'œuvre (visiteur), ramenée
 * dans `edition` : telle quelle si c'est la même édition, sinon par
 * l'alignement (`counterpart`), à défaut au même pourcentage.
 */
export async function localPosition(
  workId: string,
  edition: { id: string; revision: number; totalSegments: number },
): Promise<{ seq: number; offset: number } | null> {
  const p = (await localDb()?.workProgress.get(workId))?.body;
  if (!p) return null;
  if (p.editionId === edition.id) {
    return p.revision === edition.revision ? { seq: p.seq, offset: p.offset } : null;
  }
  try {
    const res = await fetch(
      `/api/corpus/v1/editions/${p.editionId}/counterpart?seq=${p.seq}&target=${edition.id}`,
    );
    if (res.ok) {
      const c = (await res.json()) as { seq_start: number };
      return { seq: c.seq_start, offset: 0 };
    }
  } catch {
    // Hors ligne : repli sur le pourcentage
  }
  return { seq: approxSeq(p.progress, edition.totalSegments), offset: 0 };
}
