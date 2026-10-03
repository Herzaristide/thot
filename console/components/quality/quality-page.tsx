"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Empty, ErrorBox, Loading, LoadMore } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { SIGNALS, SignalChip } from "@/components/common/signals";
import { AccessBadge, ScoreBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStartJob } from "@/lib/actions";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { QualityRow } from "@/lib/api/types";
import { languageName, num, relativeTime } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function useAck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { edition: string; signal: string; undo?: boolean }) =>
      v.undo
        ? unwrap(
            await api.DELETE("/v1/admin/quality/{edition_id}/acks/{signal}", {
              params: { path: { edition_id: v.edition, signal: v.signal } },
            }),
          )
        : unwrap(
            await api.POST("/v1/admin/quality/{edition_id}/acks", {
              params: { path: { edition_id: v.edition } },
              body: { signal: v.signal },
            }),
          ),
    onSuccess: (_, v) => {
      toast.success(v.undo ? "Signal rétabli" : "Signal accepté : il ne remontera plus");
      void qc.invalidateQueries({ queryKey: ["quality"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function Metrics({ row }: { row: QualityRow }) {
  const m = row.metrics as Record<string, number | null>;
  const items: [string, React.ReactNode][] = [
    ["Segments du corps", num(m.n_body_segments)],
    ["Sections avec texte", num(m.n_text_sections)],
    ["Notes", `${num(m.n_notes)} (${num(m.n_note_refs)} appels)`],
    [
      "Médiane / max d'un paragraphe",
      `${num(m.median_segment_chars)} / ${num(m.max_segment_chars)} car.`,
    ],
    [
      "Texte hors corps",
      m.total_chars ? `${Math.round((1 - (m.body_chars ?? 0) / m.total_chars) * 100)} %` : "–",
    ],
    [
      "Structure",
      row.structure_method === "headings"
        ? "déduite des titres"
        : row.structure_method === "toc"
          ? "table des matières"
          : "–",
    ],
    ["Langue détectée", row.detected_language ? languageName(row.detected_language) : "–"],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular">{v}</dd>
        </div>
      ))}
      {row.parse_warnings.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Avertissements de lecture</dt>
          <dd>{row.parse_warnings.join(" ; ")}</dd>
        </div>
      )}
    </dl>
  );
}

export function QualityPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const signal = params.get("signal");
  const [q, setQ] = useState(params.get("q") ?? "");
  const query = useDebounced(q);
  const [language, setLanguage] = useState("all");
  const [includeAcked, setIncludeAcked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const ack = useAck();
  const start = useStartJob();

  const signals = useQuery({
    queryKey: ["quality", "signals"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/quality/signals")),
  });
  const languages = useQuery({
    queryKey: ["overview"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/overview")),
    select: (d) => d.languages.map((l) => l.language),
  });
  const list = useInfiniteQuery({
    queryKey: ["quality", "list", signal, query, language, includeAcked],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/v1/admin/quality", {
          params: {
            query: {
              limit: 100,
              cursor: pageParam ?? undefined,
              signal: signal ? [signal] : undefined,
              q: query || undefined,
              language: language === "all" ? undefined : language,
              include_acked: includeAcked,
              sort: "score",
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const setSignal = (s: string | null) => {
    const next = new URLSearchParams(params);
    if (s) next.set("signal", s);
    else next.delete("signal");
    router.replace(`${pathname}?${next}` as never);
  };

  return (
    <>
      <PageHeader
        title="Qualité des éditions"
        description="Signaux calculés à l'extraction et depuis la base. Un signal accepté ne compte plus dans le score."
        actions={
          <Button variant="outline" size="sm" onClick={() => start.mutate({ kind: "quality" })}>
            Recalculer tout
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSignal(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            !signal && "border-primary bg-primary text-primary-foreground",
          )}
        >
          Toutes
        </button>
        {signals.data?.map((s) => (
          <button
            type="button"
            key={s.code}
            onClick={() => setSignal(signal === s.code ? null : s.code)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              signal === s.code && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {SIGNALS[s.code]?.label ?? s.code}{" "}
            <span className="tabular opacity-70">{s.count - s.acked}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Titre, œuvre ou fichier…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les langues</SelectItem>
            {languages.data?.map((l) => (
              <SelectItem key={l} value={l}>
                {languageName(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeAcked} onCheckedChange={(v) => setIncludeAcked(v === true)} />
          Inclure les signaux acceptés
        </Label>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : rows.length === 0 ? (
        <Empty>Aucune édition ne correspond.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Score</TableHead>
              <TableHead>Édition</TableHead>
              <TableHead>Signaux</TableHead>
              <TableHead className="hidden lg:table-cell">Calculé</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Fragment key={row.edition_id}>
                <TableRow
                  key={row.edition_id}
                  className="cursor-pointer"
                  onClick={() => setOpen(open === row.edition_id ? null : row.edition_id)}
                >
                  <TableCell>
                    <ScoreBadge score={row.score} />
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <Link
                      href={`/works/${row.work_id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.title}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.authors.join(", ")} · {languageName(row.language)}{" "}
                      {row.is_original ? "(original)" : ""} · <AccessBadge access={row.access} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.signals.map((s) => (
                        <SignalChip
                          key={s}
                          code={s}
                          detail={row.signal_details[s]}
                          acked={row.acked.includes(s)}
                        />
                      ))}
                      {row.signals.length === 0 && (
                        <span className="text-xs text-muted-foreground">aucun</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {row.computed_at ? relativeTime(row.computed_at) : "jamais"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {row.signals.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Accepter un signal">
                            <Check aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Accepter (vu, normal)</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {row.signals.map((s) =>
                            row.acked.includes(s) ? (
                              <DropdownMenuItem
                                key={s}
                                onSelect={() =>
                                  ack.mutate({ edition: row.edition_id, signal: s, undo: true })
                                }
                              >
                                <Undo2 aria-hidden /> Rétablir « {SIGNALS[s]?.label ?? s} »
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                key={s}
                                onSelect={() => ack.mutate({ edition: row.edition_id, signal: s })}
                              >
                                <Check aria-hidden /> {SIGNALS[s]?.label ?? s}
                              </DropdownMenuItem>
                            ),
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
                {open === row.edition_id && (
                  <TableRow
                    key={`${row.edition_id}-detail`}
                    className="bg-muted/30 hover:bg-muted/30"
                  >
                    <TableCell />
                    <TableCell colSpan={4} className="py-3">
                      <Metrics row={row} />
                      <div className="mt-2 flex gap-3 text-xs">
                        <Link href={`/editions/${row.edition_id}/structure`} className="underline">
                          Structure de l'édition
                        </Link>
                        <span className="text-muted-foreground">{row.source_file}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      <LoadMore
        hasNextPage={!!list.hasNextPage}
        isFetching={list.isFetchingNextPage}
        onClick={() => void list.fetchNextPage()}
      />
    </>
  );
}
