"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Empty, ErrorBox, Loading, LoadMore } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, unwrap } from "@/lib/api/client";
import type { CorpusEvent } from "@/lib/api/types";
import { dateTime } from "@/lib/format";

const EVENT_LABEL: Record<string, string> = {
  "work.created": "Œuvre créée",
  "work.updated": "Œuvre modifiée",
  "work.merged": "Œuvres fusionnées",
  "work.trashed": "Œuvre mise à la corbeille",
  "work.restored": "Œuvre restaurée",
  "work.deleted": "Œuvre supprimée",
  "work.alignment_changed": "Alignement modifié",
  "edition.created": "Édition ajoutée",
  "edition.updated": "Édition modifiée",
  "edition.text_replaced": "Texte ou structure remplacé",
  "edition.moved": "Édition déplacée",
  "edition.trashed": "Édition mise à la corbeille",
  "edition.restored": "Édition restaurée",
  "edition.deleted": "Édition supprimée",
  "index.activated": "Index activé",
};

function summary(e: CorpusEvent): string {
  const d = e.data as Record<string, unknown>;
  if (Array.isArray(d.fields)) return (d.fields as string[]).join(", ");
  if (d.reason) return String(d.reason);
  if (d.collection) return String(d.collection);
  return "";
}

/** Journal des modifications (corpus_events), filtrable par œuvre ou édition. */
export function EventList({
  workId,
  editionId,
  compact = false,
}: {
  workId?: string;
  editionId?: string;
  compact?: boolean;
}) {
  const q = useInfiniteQuery({
    queryKey: ["events", workId, editionId],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/v1/admin/events", {
          params: {
            query: {
              limit: compact ? 15 : 50,
              cursor: pageParam ?? undefined,
              work_id: workId,
              edition_id: editionId,
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
  });
  if (q.isLoading) return <Loading rows={3} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const events = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (!events.length) return <Empty>Aucune modification enregistrée.</Empty>;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Événement</TableHead>
            <TableHead>Détail</TableHead>
            <TableHead>Par</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                {dateTime(e.at)}
              </TableCell>
              <TableCell>
                {e.work_id && !workId ? (
                  <Link href={`/works/${e.work_id}`} className="hover:underline">
                    {EVENT_LABEL[e.type] ?? e.type}
                  </Link>
                ) : (
                  (EVENT_LABEL[e.type] ?? e.type)
                )}
              </TableCell>
              <TableCell className="max-w-sm truncate text-xs text-muted-foreground">
                {summary(e)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {e.actor ?? "ingestion"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <LoadMore
        hasNextPage={!!q.hasNextPage}
        isFetching={q.isFetchingNextPage}
        onClick={() => void q.fetchNextPage()}
      />
    </>
  );
}

export function EventsPage() {
  return (
    <>
      <PageHeader
        title="Historique"
        description="Toutes les modifications du corpus, avec leur auteur (sub Keycloak, « cli » ou ingestion)."
      />
      <EventList />
    </>
  );
}
