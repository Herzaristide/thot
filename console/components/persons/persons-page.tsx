"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, Loading, LoadMore } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import { lifespan } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";

export function PersonsPage() {
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const list = useInfiniteQuery({
    queryKey: ["persons", "list", query],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/v1/admin/persons", {
          params: { query: { q: query || undefined, limit: 100, cursor: pageParam ?? undefined } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader
        title="Personnes"
        description="Auteurs et traducteurs. Les variantes de nom servent au classement des dépôts."
      />
      <div className="relative mb-4 w-80">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          className="pl-8"
          placeholder="Nom (toutes langues) ou QID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : !rows.length ? (
        <Empty>Aucune personne.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Œuvres</TableHead>
              <TableHead className="text-right">Traductions</TableHead>
              <TableHead>Wikidata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/persons/${p.id}`} className="font-medium hover:underline">
                    {p.display_name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lifespan(p.birth_year, p.death_year)}
                </TableCell>
                <TableCell className="text-right tabular">{p.n_works}</TableCell>
                <TableCell className="text-right tabular">{p.n_translations}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.wikidata_id ?? "–"}
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
