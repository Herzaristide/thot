"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { Parallel, Segment } from "@/lib/api/types";
import { languageName } from "@/lib/format";
import { fetchRange } from "@/lib/reader/data";
import { Segments } from "./segments";

/**
 * Lecture parallèle d'une unité : paires de groupes de segments (relations
 * n-n) issues de l'alignement. Côte à côte sur grand écran, en alternance
 * (original puis traduction) sur téléphone.
 */
export function ParallelView({
  editionId,
  from,
  to,
  sourceSegments,
  sourceLang,
  target,
  showPages,
  flashSeq,
}: {
  editionId: string;
  from: number;
  to: number;
  sourceSegments: Segment[];
  sourceLang: string;
  target: { id: string; language: string };
  showPages: boolean;
  flashSeq: number | null;
}) {
  const parallel = useQuery({
    queryKey: ["parallel", editionId, target.id, from, to],
    // L'API limite une requête à 500 segments : les longs chapitres sont découpés
    queryFn: async ({ signal }) => {
      let result: Parallel | null = null;
      for (let start = from; start <= to; start += 500) {
        const part: Parallel = unwrap(
          await api.GET("/v1/editions/{edition_id}/parallel", {
            params: {
              path: { edition_id: editionId },
              query: { target: target.id, from_seq: start, to_seq: Math.min(to, start + 499) },
            },
            signal,
          }),
        );
        result = result === null ? part : { ...part, pairs: [...result.pairs, ...part.pairs] };
      }
      return result as Parallel;
    },
    staleTime: 10 * 60_000,
  });

  const targetSeqs = parallel.data?.pairs.flatMap((p) => p.target_seqs) ?? [];
  const tFrom = targetSeqs.length ? Math.min(...targetSeqs) : null;
  const tTo = targetSeqs.length ? Math.max(...targetSeqs) : null;
  const targetRange = useQuery({
    queryKey: ["segments", target.id, parallel.data?.target.revision, tFrom, tTo],
    queryFn: ({ signal }) =>
      fetchRange(target.id, parallel.data?.target.revision ?? 1, tFrom ?? 0, tTo ?? 0, signal),
    enabled: parallel.data !== undefined && tFrom !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (parallel.isError) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Pas d'alignement disponible avec l'édition {languageName(target.language)} pour ce passage.
      </p>
    );
  }

  const bySeq = new Map(sourceSegments.map((s) => [s.seq, s]));
  const targetBySeq = new Map(targetRange.data?.segments.map((s) => [s.seq, s]) ?? []);
  const pairs =
    parallel.data?.pairs ??
    sourceSegments.map((s) => ({
      source_seqs: [s.seq],
      target_seqs: [] as number[],
      score: null,
      method: null,
    }));

  return (
    <div className="space-y-3">
      {parallel.data?.quality === "doubtful" && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Alignement incertain avec cette édition : certains passages peuvent être décalés.
        </p>
      )}
      {pairs.map((p) => {
        const src = p.source_seqs.map((s) => bySeq.get(s)).filter((s): s is Segment => Boolean(s));
        const tgt = p.target_seqs
          .map((s) => targetBySeq.get(s))
          .filter((s): s is Segment => Boolean(s));
        if (src.length === 0 && tgt.length === 0) return null;
        return (
          <div
            key={`${p.source_seqs.join("-")}/${p.target_seqs.join("-")}`}
            className="grid gap-x-8 gap-y-1 md:grid-cols-2"
          >
            <div lang={sourceLang}>
              <Segments segments={src} showPages={showPages} flashSeq={flashSeq} />
            </div>
            <div
              lang={target.language}
              className="text-[0.92em] text-muted-foreground max-md:border-l-2 max-md:border-border max-md:pl-3 md:text-[1em] md:text-reader-fg [&_p]:indent-0 md:[&_p]:indent-[1.5em]"
              data-parallel-target
            >
              {tgt.length > 0 ? (
                <Segments segments={tgt} showPages={false} />
              ) : (
                targetRange.isPending &&
                p.target_seqs.length > 0 && <div className="h-4 animate-pulse rounded bg-muted" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
