"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Confirm, Empty, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { dateTime, languageName, relativeTime } from "@/lib/format";

export function TrashPage() {
  const qc = useQueryClient();
  const trash = useQuery({
    queryKey: ["trash"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/trash")),
  });
  const act = useMutation({
    mutationFn: async (v: { id: string; action: "restore" | "purge" }) =>
      v.action === "restore"
        ? unwrap(
            await api.POST("/v1/admin/editions/{edition_id}/restore", {
              params: { path: { edition_id: v.id } },
            }),
          )
        : unwrap(
            await api.POST("/v1/admin/editions/{edition_id}/purge", {
              params: { path: { edition_id: v.id } },
            }),
          ),
    onSuccess: (_, v) => {
      toast.success(
        v.action === "restore"
          ? "Édition restaurée : réindexation en cours"
          : "Suppression définitive en cours",
      );
      void qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <>
      <PageHeader
        title="Corbeille"
        description="Les éditions supprimées ne sont plus servies ni cherchables ; elles sont purgées définitivement (base, Qdrant, EPUB) après 30 jours."
      />
      {trash.isLoading ? (
        <Loading />
      ) : trash.error ? (
        <ErrorBox error={trash.error} />
      ) : !trash.data?.length ? (
        <Empty>La corbeille est vide.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Édition</TableHead>
              <TableHead>Supprimée</TableHead>
              <TableHead>Purge</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {trash.data.map((t) => (
              <TableRow key={t.edition_id}>
                <TableCell>
                  <div className="font-medium">{t.title}</div>
                  <Link
                    href={`/works/${t.work_id}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {t.work_title} · {languageName(t.language)}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {dateTime(t.deleted_at)}
                  {t.deleted_by_sub && <div>par {t.deleted_by_sub}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relativeTime(t.purge_after)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => act.mutate({ id: t.edition_id, action: "restore" })}
                  >
                    <RotateCcw aria-hidden /> Restaurer
                  </Button>{" "}
                  <Confirm
                    trigger={
                      <Button variant="ghost" size="sm" className="text-bad">
                        <Trash2 aria-hidden /> Supprimer
                      </Button>
                    }
                    title="Supprimer définitivement ?"
                    description={`« ${t.title} » : texte, alignements, points Qdrant et EPUB seront effacés. Irréversible.`}
                    confirmLabel="Supprimer définitivement"
                    destructive
                    onConfirm={() => act.mutate({ id: t.edition_id, action: "purge" })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
