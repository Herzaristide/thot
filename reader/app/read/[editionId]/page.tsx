import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reader, type ReaderEdition, type StartPosition } from "@/components/reader/reader";
import { Button } from "@/components/ui/button";
import { corpus } from "@/lib/api/server";
import type { SegmentRange } from "@/lib/api/types";
import { getUserSub } from "@/lib/auth";
import { authorsLabel } from "@/lib/format";
import type { RangeData } from "@/lib/reader/data";
import { buildUnits, firstBodyUnit, unitOf } from "@/lib/reader/units";
import { progressFor } from "@/lib/reader-data";

type Props = PageProps<"/read/[editionId]">;

async function loadEdition(id: string) {
  const api = await corpus();
  const { data, response } = await api.GET("/v1/editions/{edition_id}", {
    params: { path: { edition_id: id }, query: { lang: "fr" } },
  });
  if (!data) {
    if (response.status === 404 || response.status === 422) notFound();
    throw new Error(`Corpus API : HTTP ${response.status}`);
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await loadEdition((await params).editionId);
  return { title: e.title };
}

export default async function ReadPage({ params, searchParams }: Props) {
  const { editionId } = await params;
  const sp = await searchParams;
  const edition = await loadEdition(editionId);

  if (edition.access === "excerpt") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="font-serif text-2xl font-semibold">{edition.title}</h1>
        <p className="max-w-md text-muted-foreground">
          Cette édition est sous droits : seuls de courts extraits apparaissent dans la recherche.
        </p>
        <Button asChild variant="outline">
          <Link href={`/works/${edition.work.id}`}>Voir les autres éditions</Link>
        </Button>
      </main>
    );
  }

  const api = await corpus();
  const sub = await getUserSub();
  const [toc, work, progress] = await Promise.all([
    api.GET("/v1/editions/{edition_id}/toc", {
      params: { path: { edition_id: editionId }, query: { rev: edition.revision } },
    }),
    api.GET("/v1/works/{work_id}", {
      params: { path: { work_id: edition.work.id }, query: { lang: "fr" } },
    }),
    sub ? progressFor(sub, [editionId]) : Promise.resolve([]),
  ]);
  if (!toc.data || !work.data) throw new Error("Table des matières indisponible");

  // Position de départ : ?seq= (recherche, changement de traduction), sinon la progression
  let start: StartPosition | null = null;
  const seqParam = Number(Array.isArray(sp.seq) ? sp.seq[0] : sp.seq);
  const saved = progress[0];
  if (Number.isInteger(seqParam) && seqParam >= 0) {
    start = { seq: seqParam, offset: 0, highlight: true };
  } else if (saved) {
    start = { seq: saved.seq, offset: saved.offset, highlight: false };
    // Texte remplacé depuis : on recale l'ancre dans la nouvelle révision
    if (saved.revision !== edition.revision) {
      const { data } = await api.POST("/v1/editions/{edition_id}/anchors:resolve", {
        params: { path: { edition_id: editionId } },
        body: {
          anchors: [
            {
              key: "progress",
              revision: saved.revision,
              seq: saved.seq,
              offset: saved.offset,
              quote: saved.quote,
            },
          ],
        },
      });
      const r = data?.results[0];
      start = r?.seq != null ? { seq: r.seq, offset: r.offset ?? 0, highlight: false } : null;
    }
  }

  // Premier chapitre chargé ici : le texte arrive avec la page
  const units = buildUnits(toc.data.sections, edition.n_segments);
  const first = unitOf(units, start?.seq ?? firstBodyUnit(units)?.from ?? 0);
  let initialRange: { from: number; to: number; data: RangeData } | null = null;
  if (first && first.to - first.from < 2000) {
    const data: RangeData = { segments: [], notes: {} };
    let cursor: number | null = first.from;
    while (cursor !== null && cursor <= first.to) {
      const { data: page }: { data?: SegmentRange } = await api.GET(
        "/v1/editions/{edition_id}/segments",
        {
          params: {
            path: { edition_id: editionId },
            query: {
              from_seq: cursor,
              to_seq: first.to,
              limit: 500,
              include: ["notes"],
              rev: edition.revision,
            },
          },
        },
      );
      if (!page) break;
      data.segments.push(...page.segments);
      Object.assign(data.notes, page.notes ?? {});
      cursor = page.next_from_seq;
    }
    if (cursor === null || cursor > first.to)
      initialRange = { from: first.from, to: first.to, data };
  }

  const readerEdition: ReaderEdition = {
    id: edition.id,
    title: edition.title,
    language: edition.language,
    revision: edition.revision,
    charLength: edition.char_length,
    totalSegments: edition.n_segments,
    hasPageBreaks: edition.has_page_breaks,
    isOriginal: edition.is_original,
    work: {
      id: work.data.id,
      title: work.data.title,
      authors: authorsLabel(work.data.authors),
    },
    siblings: work.data.editions
      .filter((e) => e.id !== edition.id && e.access !== "excerpt")
      .map((e) => ({
        id: e.id,
        title: e.title,
        language: e.language,
        isOriginal: e.is_original,
        translators: e.translators.map((t) => t.name).join(", "),
        alignment: e.alignment?.status ?? null,
      })),
  };

  return (
    <Reader
      edition={readerEdition}
      toc={toc.data}
      start={start}
      startedAt={saved?.startedAt.toISOString() ?? null}
      initialRange={initialRange}
    />
  );
}
