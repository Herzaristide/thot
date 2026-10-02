import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { corpus } from "@/lib/api/server";
import { db, schema } from "@/lib/db";
import type { WorkCacheData } from "@/lib/db/schema";

const { readingProgress, favorites, collections, collectionItems, workCache } = schema;

export type CachedWork = WorkCacheData & { id: string };

function toCache(w: {
  title: string;
  original_title: string;
  first_published_year: number | null;
  authors: { id: string; name: string }[];
  movements: { id: string; slug: string; label: string }[];
  languages: string[];
}): WorkCacheData {
  return {
    title: w.title,
    original_title: w.original_title,
    first_published_year: w.first_published_year,
    authors: w.authors.map((a) => ({ id: a.id, name: a.name })),
    movements: w.movements.map((m) => ({ id: m.id, slug: m.slug, label: m.label })),
    languages: w.languages,
  };
}

/**
 * Aperçus des œuvres pour la bibliothèque : lus dans `work_cache`, complétés
 * par la Corpus API pour celles qui manquent (rafraîchis ensuite par le worker).
 */
export async function worksByIds(ids: string[]): Promise<Map<string, CachedWork>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, CachedWork>();
  if (unique.length === 0) return out;

  const rows = await db.select().from(workCache).where(inArray(workCache.workId, unique));
  for (const r of rows) out.set(r.workId, { id: r.workId, ...r.data });

  const missing = unique.filter((id) => !out.has(id));
  if (missing.length > 0) {
    const api = await corpus();
    const fetched = await Promise.all(
      missing.map(async (id) => {
        const { data } = await api.GET("/v1/works/{work_id}", {
          params: { path: { work_id: id }, query: { lang: "fr" } },
        });
        return data ? { id, data: toCache(data) } : null;
      }),
    );
    const found = fetched.filter((f) => f !== null);
    if (found.length > 0) {
      const now = new Date();
      await db
        .insert(workCache)
        .values(found.map((f) => ({ workId: f.id, data: f.data, fetchedAt: now })))
        .onConflictDoUpdate({
          target: workCache.workId,
          set: { data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at` },
        });
      for (const f of found) out.set(f.id, { id: f.id, ...f.data });
    }
  }
  return out;
}

// ------------------------------------------------------------- progression

export async function recentProgress(sub: string, limit = 12, opts: { unfinished?: boolean } = {}) {
  const rows = await db
    .select()
    .from(readingProgress)
    .where(
      opts.unfinished
        ? and(eq(readingProgress.userSub, sub), isNull(readingProgress.finishedAt))
        : eq(readingProgress.userSub, sub),
    )
    .orderBy(desc(readingProgress.updatedAt))
    .limit(limit);
  const works = await worksByIds(rows.map((r) => r.workId));
  return rows.map((r) => ({ ...r, work: works.get(r.workId) ?? null }));
}

export async function progressFor(sub: string, editionIds: string[]) {
  if (editionIds.length === 0) return [];
  return db
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.userSub, sub), inArray(readingProgress.editionId, editionIds)));
}

// ----------------------------------------------------------------- favoris

export async function listFavorites(sub: string) {
  const rows = await db
    .select()
    .from(favorites)
    .where(eq(favorites.userSub, sub))
    .orderBy(desc(favorites.createdAt));
  const works = await worksByIds(rows.map((r) => r.workId));
  return rows.map((r) => ({ ...r, work: works.get(r.workId) ?? null }));
}

export async function isFavorite(sub: string, workId: string) {
  const [row] = await db
    .select({ w: favorites.workId })
    .from(favorites)
    .where(and(eq(favorites.userSub, sub), eq(favorites.workId, workId)));
  return Boolean(row);
}

// ------------------------------------------------------------- collections

export async function listCollections(sub: string) {
  const cols = await db
    .select()
    .from(collections)
    .where(eq(collections.userSub, sub))
    .orderBy(asc(collections.position), asc(collections.createdAt));
  if (cols.length === 0) return [];
  const items = await db
    .select()
    .from(collectionItems)
    .where(
      inArray(
        collectionItems.collectionId,
        cols.map((c) => c.id),
      ),
    )
    .orderBy(asc(collectionItems.position));
  const works = await worksByIds(items.slice(0, 200).map((i) => i.workId));
  return cols.map((c) => {
    const own = items.filter((i) => i.collectionId === c.id);
    return {
      ...c,
      count: own.length,
      preview: own
        .slice(0, 4)
        .map((i) => works.get(i.workId))
        .filter((w): w is CachedWork => Boolean(w)),
      workIds: own.map((i) => i.workId),
    };
  });
}

export async function getCollection(sub: string, id: string) {
  const [col] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userSub, sub)));
  if (!col) return null;
  const items = await db
    .select()
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, id))
    .orderBy(asc(collectionItems.position));
  const works = await worksByIds(items.map((i) => i.workId));
  return { ...col, items: items.map((i) => ({ ...i, work: works.get(i.workId) ?? null })) };
}

export type CollectionWithItems = NonNullable<Awaited<ReturnType<typeof getCollection>>>;
export type CollectionSummary = Awaited<ReturnType<typeof listCollections>>[number];
export type ProgressWithWork = Awaited<ReturnType<typeof recentProgress>>[number];
