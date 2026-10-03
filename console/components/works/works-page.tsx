"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, Loading, LoadMore } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { ScoreBadge } from "@/components/common/status";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import { languageName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";

export function WorksPage() {
  const [q, setQ] = useState("");
  const [trashed, setTrashed] = useState(false);
  const query = useDebounced(q);
  const list = useInfiniteQuery({
    queryKey: ["works", "list", query, trashed],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/v1/admin/works", {
          params: {
            query: { q: query || undefined, trashed, limit: 100, cursor: pageParam ?? undefined },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader
        title="Œuvres"
        description="Fiches des œuvres et de leurs éditions : la base est la référence."
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-80">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Titre (toutes langues), auteur, slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Label className="flex items-center gap-2 text-sm">
          <Checkbox checked={trashed} onCheckedChange={(v) => setTrashed(v === true)} /> Corbeille
        </Label>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : !rows.length ? (
        <Empty>Aucune œuvre.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Œuvre</TableHead>
              <TableHead className="hidden md:table-cell">Langue d'origine</TableHead>
              <TableHead>Éditions</TableHead>
              <TableHead className="hidden sm:table-cell">Qualité min.</TableHead>
              <TableHead className="hidden lg:table-cell">Wikidata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="max-w-md">
                  <Link href={`/works/${w.id}`} className="font-medium hover:underline">
                    {w.title}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {w.authors.join(", ") || "auteur inconnu"}
                    {w.first_published_year ? ` · ${w.first_published_year}` : ""}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {languageName(w.original_language)}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="tabular">{w.n_editions}</span>{" "}
                  <span className="text-xs text-muted-foreground">{w.languages.join(", ")}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ScoreBadge score={w.min_score} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {w.wikidata_id ?? "–"}
                </TableCell>
              </TableRow>
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
