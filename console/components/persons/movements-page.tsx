"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Confirm, Empty, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { AdminMovement } from "@/lib/api/types";

type Form = {
  slug: string;
  parent: string;
  start: string;
  end: string;
  wikidata: string;
  fr: string;
  en: string;
};

function MovementDialog({
  movement,
  all,
  onClose,
}: {
  movement: AdminMovement | null;
  all: AdminMovement[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>({
    slug: movement?.slug ?? "",
    parent: movement?.parent_id ?? "none",
    start: movement?.start_year ? String(movement.start_year) : "",
    end: movement?.end_year ? String(movement.end_year) : "",
    wikidata: movement?.wikidata_id ?? "",
    fr: movement?.labels.fr ?? "",
    en: movement?.labels.en ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const labels = { ...(movement?.labels ?? {}), fr: f.fr, en: f.en };
      const body = {
        slug: f.slug,
        parent_id: f.parent === "none" ? null : f.parent,
        start_year: f.start ? Number(f.start) : null,
        end_year: f.end ? Number(f.end) : null,
        wikidata_id: f.wikidata || null,
        labels: Object.fromEntries(Object.entries(labels).filter(([, v]) => v)),
      };
      return movement
        ? unwrap(
            await api.PATCH("/v1/admin/movements/{movement_id}", {
              params: { path: { movement_id: movement.id } },
              body,
            }),
          )
        : unwrap(await api.POST("/v1/admin/movements", { body }));
    },
    onSuccess: (list) => {
      qc.setQueryData(["movements"], list);
      toast.success("Courant enregistré");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{movement ? "Modifier le courant" : "Nouveau courant"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-fr">Libellé (fr)</Label>
            <Input id="m-fr" value={f.fr} onChange={(e) => setF({ ...f, fr: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-en">Libellé (en)</Label>
            <Input id="m-en" value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-slug">Slug</Label>
            <Input
              id="m-slug"
              placeholder="realism"
              value={f.slug}
              onChange={(e) => setF({ ...f, slug: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Courant parent</Label>
            <Select value={f.parent} onValueChange={(v) => setF({ ...f, parent: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">(aucun)</SelectItem>
                {all
                  .filter((m) => m.id !== movement?.id)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.labels.fr ?? m.slug}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-start">Début</Label>
            <Input
              id="m-start"
              inputMode="numeric"
              value={f.start}
              onChange={(e) => setF({ ...f, start: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-end">Fin</Label>
            <Input
              id="m-end"
              inputMode="numeric"
              value={f.end}
              onChange={(e) => setF({ ...f, end: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="m-wd">Wikidata</Label>
            <Input
              id="m-wd"
              value={f.wikidata}
              onChange={(e) => setF({ ...f, wikidata: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => save.mutate()} disabled={!f.slug || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tree(list: AdminMovement[]): { m: AdminMovement; depth: number }[] {
  const out: { m: AdminMovement; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const m of list.filter((x) => x.parent_id === parent)) {
      out.push({ m, depth });
      walk(m.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function MovementsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminMovement | "new" | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/movements")),
  });
  const del = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/v1/admin/movements/{movement_id}", {
          params: { path: { movement_id: id } },
        }),
      ),
    onSuccess: (list) => {
      qc.setQueryData(["movements"], list);
      toast.success("Courant supprimé");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <>
      <PageHeader
        title="Courants littéraires"
        description="Arbre des courants ; une œuvre peut en avoir plusieurs (fiche de l'œuvre)."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> Nouveau courant
          </Button>
        }
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !data?.length ? (
        <Empty>Aucun courant.</Empty>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tree(data).map(({ m, depth }) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
                <span className="font-medium">{m.labels.fr ?? m.labels.en ?? m.slug}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {m.slug}
                  {m.start_year ? ` · ${m.start_year}–${m.end_year ?? ""}` : ""}
                </span>
              </span>
              <span className="text-xs text-muted-foreground tabular">{m.n_works} œuvre(s)</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Modifier"
                onClick={() => setEditing(m)}
              >
                <Pencil aria-hidden />
              </Button>
              <Confirm
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Supprimer">
                    <Trash2 aria-hidden />
                  </Button>
                }
                title={`Supprimer « ${m.labels.fr ?? m.slug} » ?`}
                description={`Il est retiré de ${m.n_works} œuvre(s) ; ses sous-courants remontent à la racine.`}
                confirmLabel="Supprimer"
                destructive
                onConfirm={() => del.mutate(m.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <MovementDialog
          movement={editing === "new" ? null : editing}
          all={data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
