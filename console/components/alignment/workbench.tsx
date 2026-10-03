"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CircleOff,
  FastForward,
  Link2,
  Loader2,
  Save,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { AlignmentBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStartJob } from "@/lib/actions";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { AlignedEdition, AlignmentMap, WorkbenchTarget } from "@/lib/api/types";
import { languageName, num, percent, score } from "@/lib/format";
import { cn } from "@/lib/utils";

const WINDOW = 30;

function scoreColor(s: number | null | undefined): string {
  if (s === null || s === undefined) return "bg-muted";
  if (s >= 0.75) return "bg-ok";
  if (s >= 0.6) return "bg-ok/60";
  if (s >= 0.5) return "bg-warn";
  return "bg-bad";
}

/** Bande des sections du corps : couleur = score moyen, hauteur = part alignée. */
function SectionMap({
  map,
  onJump,
  current,
}: {
  map: AlignmentMap;
  onJump: (seq: number) => void;
  current: number;
}) {
  return (
    <nav
      className="flex h-12 items-end gap-px overflow-x-auto rounded-md border bg-muted/40 p-1"
      aria-label="Sections du livre"
    >
      {map.sections.map((s) => {
        const ratio = s.n_segments ? s.n_aligned / s.n_segments : 0;
        const here =
          s.seq_start !== null &&
          s.seq_end !== null &&
          current >= s.seq_start &&
          current <= s.seq_end;
        return (
          <Tooltip key={s.section_id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => s.seq_start !== null && onJump(s.seq_start)}
                className={cn(
                  "min-w-1.5 flex-1 rounded-sm transition-opacity hover:opacity-80",
                  scoreColor(s.mean_score),
                  here && "outline-2 outline-offset-1 outline-foreground",
                )}
                style={{
                  height: `${Math.max(12, ratio * 100)}%`,
                  flexGrow: Math.max(1, Math.log2(1 + s.n_segments)),
                }}
                aria-label={`${s.label ?? s.title ?? s.kind} : ${percent(ratio)} aligné`}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">
                {[s.label, s.title].filter(Boolean).join(" — ") || s.kind}
              </p>
              <p>
                {num(s.n_aligned)}/{num(s.n_segments)} alignés · score {score(s.mean_score)} ·{" "}
                {s.n_low} faible(s)
              </p>
              {s.reference_title && <p>↔ {s.reference_title}</p>}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function Workbench({ editionId }: { editionId: string }) {
  const qc = useQueryClient();
  const start = useStartJob();
  const [from, setFrom] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [refPick, setRefPick] = useState<number[]>([]);

  const info = useQuery({
    queryKey: ["alignment", "editions", "one", editionId],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/alignment/editions", { params: { query: { sort: "todo" } } }),
      ).find((e) => e.edition_id === editionId) as AlignedEdition | undefined,
  });
  const map = useQuery({
    queryKey: ["alignment", "map", editionId],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/alignment/editions/{edition_id}/map", {
          params: { path: { edition_id: editionId } },
        }),
      ),
  });
  const bench = useQuery({
    queryKey: ["alignment", "bench", editionId, from],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/alignment/editions/{edition_id}/workbench", {
          params: { path: { edition_id: editionId }, query: { from_seq: from, limit: WINDOW } },
        }),
      ),
    placeholderData: (prev) => prev,
  });

  const target = bench.data?.target ?? [];
  const current = target.find((t) => t.seq === selected) ?? null;
  // Segments de référence liés au segment cible choisi
  const linkedRefs = useMemo(
    () =>
      new Set(
        current?.links.map((l) => l.reference_seq).filter((s): s is number => s !== null) ?? [],
      ),
    [current],
  );
  // Pour chaque segment de référence : segments cibles qui y sont liés (fils visuels)
  const refToTargets = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const t of target)
      for (const l of t.links)
        if (l.reference_seq !== null)
          m.set(l.reference_seq, [...(m.get(l.reference_seq) ?? []), t.seq]);
    return m;
  }, [target]);

  const select = (t: WorkbenchTarget) => {
    setSelected(t.seq);
    setRefPick(t.links.map((l) => l.reference_seq).filter((s): s is number => s !== null));
  };

  const save = useMutation({
    mutationFn: async (seqs: number[]) =>
      unwrap(
        await api.POST("/v1/admin/alignment/links/replace", {
          body: { edition_id: editionId, seq: selected ?? 0, reference_seqs: seqs },
        }),
      ),
    onSuccess: () => {
      toast.success("Liens enregistrés");
      void qc.invalidateQueries({ queryKey: ["alignment"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const status = useMutation({
    mutationFn: async (s: "reliable" | "doubtful" | "rejected") =>
      unwrap(
        await api.POST("/v1/admin/alignment/editions/{edition_id}/status", {
          params: { path: { edition_id: editionId } },
          body: { status: s },
        }),
      ),
    onSuccess: () => {
      toast.success("Statut enregistré");
      void qc.invalidateQueries({ queryKey: ["alignment"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const nextLow = useCallback(async () => {
    try {
      const n = unwrap(
        await api.GET("/v1/admin/alignment/editions/{edition_id}/next", {
          params: { path: { edition_id: editionId }, query: { after_seq: selected ?? from - 1 } },
        }),
      );
      if (n.seq === null) {
        toast.success("Plus aucun lien douteux après ce point");
        return;
      }
      setFrom(Math.max(0, n.seq - 3));
      setSelected(n.seq);
      setRefPick([]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [editionId, selected, from]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n") void nextLow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextLow]);

  // Après chargement d'une fenêtre ouverte par « suivant », recopier les liens du segment visé
  useEffect(() => {
    if (current && refPick.length === 0 && current.links.length) {
      setRefPick(current.links.map((l) => l.reference_seq).filter((s): s is number => s !== null));
    }
  }, [current, refPick.length]);

  if (bench.isLoading) return <Loading rows={10} />;
  if (bench.error || !bench.data) return <ErrorBox error={bench.error} />;
  const b = bench.data;
  const changed =
    current !== null &&
    JSON.stringify([...refPick].sort((x, y) => x - y)) !==
      JSON.stringify([...linkedRefs].sort((x, y) => x - y));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/alignment" className="hover:underline">
            Atelier d'alignement
          </Link>
        }
        title={info.data?.work_title ?? "Alignement"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {languageName(b.language)} → {languageName(b.reference_language)} (référence)
            <AlignmentBadge status={b.status} />
            {info.data && (
              <span className="text-xs">
                {percent(info.data.aligned_ratio ?? 0)} aligné · score {score(info.data.mean_score)}{" "}
                · {info.data.manual_links} lien(s) manuel(s)
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => status.mutate("reliable")}>
              Marquer fiable
            </Button>
            <Button variant="outline" size="sm" onClick={() => status.mutate("rejected")}>
              Rejeter
            </Button>
            {info.data && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  start.mutate({
                    kind: "align",
                    params: { work_id: info.data?.work_id, force: true },
                    title: `Réalignement de ${info.data?.work_title}`,
                  })
                }
              >
                Réaligner l'œuvre
              </Button>
            )}
          </>
        }
      />
      {map.data && (
        <div className="mb-4">
          <SectionMap
            map={map.data}
            current={selected ?? from}
            onJump={(seq) => {
              setFrom(seq);
              setSelected(null);
              setRefPick([]);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Une barre par section : couleur = score moyen, hauteur = part alignée. Cliquer pour y
            aller.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={from === 0}
          onClick={() => setFrom(Math.max(0, from - WINDOW))}
        >
          <ChevronLeft aria-hidden /> Précédent
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!b.has_more}
          onClick={() => setFrom((target.at(-1)?.seq ?? from) + 1)}
        >
          Suivant <ChevronRight aria-hidden />
        </Button>
        <Button size="sm" onClick={() => void nextLow()}>
          <FastForward aria-hidden /> Lien douteux suivant{" "}
          <kbd className="ml-1 rounded border px-1 text-xs">n</kbd>
        </Button>
        {bench.isFetching && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        )}
        <span className="flex-1" />
        {current && (
          <span className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
            Segment {current.seq} →{" "}
            {refPick.length ? `référence ${refPick.join(", ")}` : "sans correspondant"}
            <Button
              size="sm"
              disabled={!changed || save.isPending}
              onClick={() => save.mutate(refPick)}
            >
              {save.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}{" "}
              Enregistrer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                setRefPick([]);
                save.mutate([]);
              }}
            >
              <CircleOff aria-hidden /> Aucun
            </Button>
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 py-3">
          <CardHeader className="px-3">
            <CardTitle>{languageName(b.language)} — cliquer un segment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 font-serif text-[15px] leading-relaxed">
            {target.map((t) => (
              <button
                type="button"
                key={t.seq}
                onClick={() => select(t)}
                className={cn(
                  "group flex gap-2 rounded-md border-l-4 px-2 py-1.5 text-left transition-colors hover:bg-accent/50",
                  t.links.length
                    ? t.manual
                      ? "border-info"
                      : scoreColor(t.best_score).replace("bg-", "border-")
                    : "border-transparent",
                  selected === t.seq && "bg-primary/10 ring-1 ring-primary",
                  t.kind === "heading" && "font-semibold",
                )}
              >
                <span className="w-10 shrink-0 pt-0.5 text-right font-sans text-xs text-muted-foreground tabular">
                  {t.seq}
                </span>
                <span className="min-w-0 flex-1">
                  {t.text}
                  <span className="mt-0.5 block font-sans text-xs text-muted-foreground">
                    {t.links.length === 0
                      ? "sans correspondant"
                      : t.manual
                        ? `lien manuel → ${t.links.map((l) => l.reference_seq).join(", ")}`
                        : `score ${score(t.best_score)} → ${t.links.map((l) => l.reference_seq).join(", ")}`}
                  </span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="gap-2 py-3">
          <CardHeader className="px-3">
            <CardTitle>
              {languageName(b.reference_language)} (référence) — choisir les correspondants
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 px-3 font-serif text-[15px] leading-relaxed">
            {b.reference.map((r) => {
              const picked = refPick.includes(r.seq);
              const targets = refToTargets.get(r.seq) ?? [];
              return (
                <button
                  type="button"
                  key={r.seq}
                  disabled={!current || !r.unit_id}
                  onClick={() =>
                    setRefPick(
                      picked
                        ? refPick.filter((s) => s !== r.seq)
                        : [...refPick, r.seq].sort((x, y) => x - y),
                    )
                  }
                  className={cn(
                    "flex gap-2 rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent/50 disabled:cursor-default",
                    linkedRefs.has(r.seq) && "bg-muted",
                    picked && "bg-primary/10 ring-1 ring-primary",
                    r.kind === "heading" && "font-semibold",
                  )}
                >
                  <span className="w-10 shrink-0 pt-0.5 text-right font-sans text-xs text-muted-foreground tabular">
                    {r.seq}
                  </span>
                  <span className="min-w-0 flex-1">
                    {r.text}
                    {targets.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 font-sans text-xs text-muted-foreground">
                        <Link2 className="size-3" aria-hidden /> {targets.join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
