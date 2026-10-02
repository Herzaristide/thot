"use client";

import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { Note, Segment, SegmentRange, Toc } from "@/lib/api/types";
import { localDb, type OfflineSegments } from "@/lib/offline/db";

/**
 * Texte d'une édition : réponses immuables pour une révision donnée (`rev=`),
 * donc gardées sans limite de durée. Si le livre a été téléchargé, il est lu
 * dans IndexedDB, sans réseau.
 */

export type RangeData = { segments: Segment[]; notes: Record<string, Note> };

const PAGE = 500;

export function bookKey(editionId: string, revision: number) {
  return `${editionId}:${revision}`;
}

async function fromOffline(editionId: string, rev: number, from: number, to: number) {
  const db = localDb();
  if (!db) return null;
  const book = await db.books.get(bookKey(editionId, rev));
  if (!book) return null;
  const chunks = await db.segments
    .where("book")
    .equals(book.key)
    .filter((c) => c.fromSeq <= to && c.fromSeq + PAGE > from)
    .toArray();
  const segments = chunks
    .flatMap((c) => c.segments)
    .filter((s) => s.seq >= from && s.seq <= to)
    .sort((a, b) => a.seq - b.seq);
  const notes = Object.assign({}, ...chunks.map((c) => c.notes ?? {})) as Record<string, Note>;
  return { segments, notes };
}

/** Segments [from, to] d'une révision (plusieurs pages de 500 si besoin). */
export async function fetchRange(
  editionId: string,
  rev: number,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<RangeData> {
  const offline = await fromOffline(editionId, rev, from, to);
  if (offline && offline.segments.length > 0) return offline;

  const segments: Segment[] = [];
  const notes: Record<string, Note> = {};
  let cursor: number | null = from;
  while (cursor !== null && cursor <= to) {
    const data: SegmentRange = unwrap(
      await api.GET("/v1/editions/{edition_id}/segments", {
        params: {
          path: { edition_id: editionId },
          query: { from_seq: cursor, to_seq: to, limit: PAGE, include: ["notes"], rev },
        },
        signal,
      }),
    );
    segments.push(...data.segments);
    Object.assign(notes, data.notes ?? {});
    cursor = data.next_from_seq;
  }
  return { segments, notes };
}

export function rangeQuery(editionId: string, rev: number, from: number, to: number) {
  return queryOptions({
    queryKey: ["segments", editionId, rev, from, to],
    queryFn: ({ signal }) => fetchRange(editionId, rev, from, to, signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
  });
}

export function prefetchRange(
  qc: QueryClient,
  editionId: string,
  rev: number,
  from: number,
  to: number,
) {
  return qc.prefetchQuery(rangeQuery(editionId, rev, from, to));
}

/** Contenu d'une note absente de la plage chargée. */
export async function fetchNote(editionId: string, noteId: string, rev: number): Promise<Note> {
  return unwrap(
    await api.GET("/v1/editions/{edition_id}/notes/{note_id}", {
      params: { path: { edition_id: editionId, note_id: noteId }, query: { rev } },
    }),
  );
}

// ---------------------------------------------------------- téléchargement

export type DownloadProgress = { done: number; total: number };

/** Télécharge tout le livre dans IndexedDB (lecture hors ligne). */
export async function downloadBook(
  meta: {
    editionId: string;
    revision: number;
    workId: string;
    title: string;
    authors: string;
    language: string;
    toc: Toc;
    totalSegments: number;
  },
  onProgress?: (p: DownloadProgress) => void,
) {
  const db = localDb();
  if (!db) throw new Error("IndexedDB indisponible");
  await navigator.storage?.persist?.().catch(() => false);

  const key = bookKey(meta.editionId, meta.revision);
  let bytes = 0;
  let from = 0;
  const chunks: OfflineSegments[] = [];
  while (from < meta.totalSegments) {
    const data: SegmentRange = unwrap(
      await api.GET("/v1/editions/{edition_id}/segments", {
        params: {
          path: { edition_id: meta.editionId },
          query: { from_seq: from, limit: PAGE, include: ["notes"], rev: meta.revision },
        },
      }),
    );
    bytes += JSON.stringify(data).length;
    chunks.push({
      key: `${key}:${from}`,
      book: key,
      fromSeq: from,
      segments: data.segments,
      notes: (data.notes ?? null) as OfflineSegments["notes"],
    });
    onProgress?.({ done: Math.min(from + PAGE, meta.totalSegments), total: meta.totalSegments });
    if (data.next_from_seq === null) break;
    from = data.next_from_seq;
  }
  await db.transaction("rw", db.books, db.segments, async () => {
    // Anciennes révisions du même livre : remplacées
    const old = await db.books.where("editionId").equals(meta.editionId).toArray();
    for (const b of old) {
      await db.segments.where("book").equals(b.key).delete();
      await db.books.delete(b.key);
    }
    await db.segments.bulkPut(chunks);
    await db.books.put({ ...meta, key, bytes, downloadedAt: Date.now() });
  });
  // Page de la liseuse gardée par le service worker (cache « pages ») : le
  // livre s'ouvre hors ligne même si on ne l'a jamais ouvert depuis l'accueil.
  await caches
    ?.open("pages")
    .then((c) => c.add(`/read/${meta.editionId}`))
    .catch(() => {});
}

export async function removeBook(key: string) {
  const db = localDb();
  if (!db) return;
  await db.transaction("rw", db.books, db.segments, async () => {
    await db.segments.where("book").equals(key).delete();
    await db.books.delete(key);
  });
}
