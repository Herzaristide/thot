"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  GitCompareArrows,
  GitMerge,
  ListTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Confirm, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { PersonList, type PersonRef, WorkPicker, type WorkRef } from "@/components/common/pickers";
import { SignalChip } from "@/components/common/signals";
import { AccessBadge, AlignmentBadge, ScoreBadge } from "@/components/common/status";
import { EventList } from "@/components/history/events-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useStartJob } from "@/lib/actions";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";
import type { AdminEditionRow, AdminWork } from "@/lib/api/types";
import { languageName, num, percent } from "@/lib/format";
import { EditionDialog } from "./edition-dialog";
import { ensurePersons } from "./persons";

type Form = {
  title: string;
  original_language: string;
  first_published_year: string;
  wikidata_id: string;
  titles: { language: string; title: string }[];
  authors: PersonRef[];
  movement_ids: string[];
};

function toForm(w: AdminWork): Form {
  return {
    title: w.title,
    original_language: w.original_language ?? "",
    first_published_year: w.first_published_year ? String(w.first_published_year) : "",
    wikidata_id: w.wikidata_id ?? "",
    titles: w.titles.map((t) => ({ ...t })),
    authors: w.authors.map((a) => ({ id: a.id, name: a.name, wikidata_id: a.wikidata_id })),
    movement_ids: w.movements.map((m) => m.id),
  };
}

function useMovements() {
  return useQuery({
    queryKey: ["movements"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/movements")),
  });
}

function WorkForm({ work }: { work: AdminWork }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => toForm(work));
  const movements = useMovements();
  // Rechargée (temps réel, autre onglet) : on reprend la version serveur si rien n'est modifié
  const [base, setBase] = useState(work.updated_at);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(work));
  useEffect(() => {
    if (work.updated_at !== base && !dirty) {
      setForm(toForm(work));
      setBase(work.updated_at);
    }
  }, [work, base, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const author_ids = await ensurePersons(form.authors);
      return unwrap(
        await api.PATCH("/v1/admin/works/{work_id}", {
          params: { path: { work_id: work.id }, header: { "if-match": `"${base}"` } },
          body: {
            title: form.title,
            original_language: form.original_language || null,
            first_published_year: form.first_published_year
              ? Number(form.first_published_year)
              : null,
            wikidata_id: form.wikidata_id || null,
            titles: form.titles.filter((t) => t.language && t.title),
            author_ids,
            movement_ids: form.movement_ids,
          },
        }),
      );
    },
    onSuccess: (w) => {
      toast.success("Fiche enregistrée");
      qc.setQueryData(["work", work.id], w);
      setForm(toForm(w));
      setBase(w.updated_at);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError && err.status === 412
          ? "Quelqu'un a modifié cette fiche entre-temps : rechargez la page avant d'enregistrer."
          : errorMessage(err),
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiche</CardTitle>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setForm(toForm(work))}>
              Annuler
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}{" "}
            Enregistrer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="w-title">Titre de référence</Label>
          <Input
            id="w-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 md:col-span-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-lang">Langue originale</Label>
            <Input
              id="w-lang"
              value={form.original_language}
              onChange={(e) => setForm({ ...form, original_language: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-year">Première publication</Label>
            <Input
              id="w-year"
              inputMode="numeric"
              value={form.first_published_year}
              onChange={(e) => setForm({ ...form, first_published_year: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-wd">Wikidata</Label>
            <Input
              id="w-wd"
              value={form.wikidata_id}
              onChange={(e) => setForm({ ...form, wikidata_id: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Auteurs</Label>
          <PersonList
            value={form.authors}
            onChange={(authors) => setForm({ ...form, authors })}
            placeholder="Ajouter un auteur"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Titres par langue</Label>
          {form.titles.map((t, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="w-20"
                value={t.language}
                aria-label="Langue"
                onChange={(e) =>
                  setForm({
                    ...form,
                    titles: form.titles.map((x, j) =>
                      j === i ? { ...x, language: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                value={t.title}
                aria-label="Titre"
                onChange={(e) =>
                  setForm({
                    ...form,
                    titles: form.titles.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Retirer ce titre"
                onClick={() => setForm({ ...form, titles: form.titles.filter((_, j) => j !== i) })}
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setForm({ ...form, titles: [...form.titles, { language: "", title: "" }] })
            }
          >
            <Plus aria-hidden /> Ajouter un titre
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Courants</Label>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            {movements.data?.map((m) => (
              <Label key={m.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={form.movement_ids.includes(m.id)}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      movement_ids: v
                        ? [...form.movement_ids, m.id]
                        : form.movement_ids.filter((x) => x !== m.id),
                    })
                  }
                />
                {m.labels.fr ?? m.labels.en ?? m.slug}
              </Label>
            ))}
            {movements.data?.length === 0 && (
              <span className="text-xs text-muted-foreground">Aucun courant défini.</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditionRow({
  e,
  workId,
  readerUrl,
}: {
  e: AdminEditionRow;
  workId: string;
  readerUrl?: string;
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const act = useMutation({
    mutationFn: async (action: "trash" | "restore") =>
      action === "trash"
        ? unwrap(
            await api.DELETE("/v1/admin/editions/{edition_id}", {
              params: { path: { edition_id: e.id } },
            }),
          )
        : unwrap(
            await api.POST("/v1/admin/editions/{edition_id}/restore", {
              params: { path: { edition_id: e.id } },
            }),
          ),
    onSuccess: (w, action) => {
      qc.setQueryData(["work", workId], w);
      toast.success(action === "trash" ? "Édition mise à la corbeille" : "Édition restaurée");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <TableRow className={e.deleted_at ? "opacity-60" : undefined}>
      <TableCell className="max-w-xs">
        <div className="font-medium">
          {e.title} {e.deleted_at && <span className="text-xs text-bad">(corbeille)</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {e.translators.map((t) => t.name).join(", ") ||
            (e.is_original ? "texte original" : "traducteur inconnu")}
          {e.publisher ? ` · ${e.publisher}` : ""}
          {e.year ? `, ${e.year}` : ""}
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {languageName(e.language)}{" "}
        {e.is_original && <span className="text-xs text-muted-foreground">original</span>}
      </TableCell>
      <TableCell>
        <AccessBadge access={e.access} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <ScoreBadge score={e.quality_score} />
          <div className="hidden flex-wrap gap-1 xl:flex">
            {e.signals.slice(0, 2).map((s) => (
              <SignalChip key={s} code={s} />
            ))}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {e.is_reference ? (
          <AlignmentBadge status="reference" />
        ) : (
          <span className="flex items-center gap-1.5">
            <AlignmentBadge status={e.alignment_status} />
            {e.aligned_ratio !== null && (
              <span className="text-xs tabular">{percent(e.aligned_ratio)}</span>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs tabular">{num(e.n_segments)}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEdit(true)}>
              <Pencil aria-hidden /> Modifier, déplacer
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/editions/${e.id}/structure`}>
                <ListTree aria-hidden /> Structure
              </Link>
            </DropdownMenuItem>
            {!e.is_reference && e.alignment_status && (
              <DropdownMenuItem asChild>
                <Link href={`/alignment/${e.id}`}>
                  <GitCompareArrows aria-hidden /> Atelier d'alignement
                </Link>
              </DropdownMenuItem>
            )}
            {readerUrl && (
              <DropdownMenuItem asChild>
                <a href={`${readerUrl}/read/${e.id}`} target="_blank" rel="noreferrer">
                  <BookOpen aria-hidden /> Ouvrir dans la liseuse
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {e.deleted_at ? (
              <DropdownMenuItem onSelect={() => act.mutate("restore")}>
                <RotateCcw aria-hidden /> Restaurer
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-bad" onSelect={() => act.mutate("trash")}>
                <Trash2 aria-hidden /> Mettre à la corbeille
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {edit && <EditionDialog edition={e} workId={workId} open={edit} onOpenChange={setEdit} />}
      </TableCell>
    </TableRow>
  );
}

function MergeDialog({
  work,
  open,
  onOpenChange,
}: {
  work: AdminWork;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [into, setInto] = useState<WorkRef | null>(null);
  const merge = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/v1/admin/works/{work_id}/merge", {
          params: { path: { work_id: work.id } },
          body: { into: into?.id ?? "" },
        }),
      ),
    onSuccess: (w) => {
      toast.success("Œuvres fusionnées : réalignement en cours");
      window.location.assign(`/works/${w.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fusionner « {work.title} »</DialogTitle>
          <DialogDescription>
            Ses éditions, titres, auteurs et courants rejoignent l'œuvre choisie ; celle-ci va à la
            corbeille. Utile quand un dépôt a créé un doublon.
          </DialogDescription>
        </DialogHeader>
        <WorkPicker
          value={into}
          onChange={setInto}
          exclude={work.id}
          placeholder="Œuvre qui reste…"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!into || merge.isPending} onClick={() => merge.mutate()}>
            {merge.isPending && <Loader2 className="animate-spin" aria-hidden />} Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkPage({ id, readerUrl }: { id: string; readerUrl?: string }) {
  const qc = useQueryClient();
  const start = useStartJob();
  const [merging, setMerging] = useState(false);
  const {
    data: work,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["work", id],
    queryFn: async () =>
      unwrap(await api.GET("/v1/admin/works/{work_id}", { params: { path: { work_id: id } } })),
  });
  const trash = useMutation({
    mutationFn: async (restore: boolean) =>
      restore
        ? unwrap(
            await api.POST("/v1/admin/works/{work_id}/restore", {
              params: { path: { work_id: id } },
            }),
          )
        : unwrap(
            await api.DELETE("/v1/admin/works/{work_id}", { params: { path: { work_id: id } } }),
          ),
    onSuccess: (w, restore) => {
      qc.setQueryData(["work", id], w);
      toast.success(restore ? "Œuvre restaurée" : "Œuvre et éditions mises à la corbeille");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (isLoading) return <Loading rows={8} />;
  if (error || !work) return <ErrorBox error={error} />;
  const live = work.editions.filter((e) => !e.deleted_at);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/works" className="hover:underline">
            Œuvres
          </Link>
        }
        title={
          <>
            {work.title}{" "}
            {work.deleted_at && <span className="text-base text-bad">(corbeille)</span>}
          </>
        }
        description={`${work.authors.map((a) => a.name).join(", ") || "auteur inconnu"} · ${work.slug ?? ""}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={live.length < 2}
              onClick={() =>
                start.mutate({
                  kind: "align",
                  params: { work_id: work.id, force: true },
                  title: `Réalignement de ${work.title}`,
                })
              }
            >
              <GitCompareArrows aria-hidden /> Réaligner
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMerging(true)}
              disabled={!!work.deleted_at}
            >
              <GitMerge aria-hidden /> Fusionner…
            </Button>
            {work.deleted_at ? (
              <Button variant="outline" size="sm" onClick={() => trash.mutate(true)}>
                <RotateCcw aria-hidden /> Restaurer
              </Button>
            ) : (
              <Confirm
                trigger={
                  <Button variant="outline" size="sm" className="text-bad">
                    <Trash2 aria-hidden /> Corbeille
                  </Button>
                }
                title="Mettre l'œuvre à la corbeille ?"
                description={`Ses ${live.length} édition(s) disparaissent de la recherche et des applications. Restauration possible pendant 30 jours.`}
                confirmLabel="Mettre à la corbeille"
                destructive
                onConfirm={() => trash.mutate(false)}
              />
            )}
          </>
        }
      />
      <WorkForm key={work.id} work={work} />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Éditions</CardTitle>
          <Link href={`/upload`} className="text-xs text-muted-foreground underline">
            déposer une édition
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Édition</TableHead>
                <TableHead>Langue</TableHead>
                <TableHead>Droits</TableHead>
                <TableHead>Qualité</TableHead>
                <TableHead>Alignement</TableHead>
                <TableHead className="text-right">Segments</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {work.editions.map((e) => (
                <EditionRow key={e.id} e={e} workId={work.id} readerUrl={readerUrl} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          <EventList workId={work.id} compact />
        </CardContent>
      </Card>
      {merging && <MergeDialog work={work} open={merging} onOpenChange={setMerging} />}
    </>
  );
}
