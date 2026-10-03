"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PersonList, type PersonRef, WorkPicker, type WorkRef } from "@/components/common/pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { AdminEditionRow } from "@/lib/api/types";
import { ensurePersons } from "./persons";

export function EditionDialog({
  edition,
  workId,
  open,
  onOpenChange,
}: {
  edition: AdminEditionRow;
  workId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: edition.title,
    language: edition.language,
    is_original: edition.is_original,
    access: edition.access,
    publisher: edition.publisher ?? "",
    year: edition.year ? String(edition.year) : "",
  });
  const [translators, setTranslators] = useState<PersonRef[]>(
    edition.translators.map((t) => ({ id: t.id, name: t.name, wikidata_id: t.wikidata_id })),
  );
  const [target, setTarget] = useState<WorkRef | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const ids = await ensurePersons(translators);
      return unwrap(
        await api.PATCH("/v1/admin/editions/{edition_id}", {
          params: {
            path: { edition_id: edition.id },
            header: { "if-match": `"${edition.updated_at}"` },
          },
          body: {
            title: form.title,
            language: form.language,
            is_original: form.is_original,
            access: form.access,
            publisher: form.publisher || null,
            year: form.year ? Number(form.year) : null,
            translator_ids: ids,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("Édition enregistrée");
      void qc.invalidateQueries({ queryKey: ["work", workId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const move = useMutation({
    mutationFn: async (to: string) =>
      unwrap(
        await api.POST("/v1/admin/editions/{edition_id}/move", {
          params: { path: { edition_id: edition.id } },
          body: { work_id: to },
        }),
      ),
    onSuccess: (_, to) => {
      toast.success("Édition déplacée : réalignement des deux œuvres en cours");
      void qc.invalidateQueries({ queryKey: ["work"] });
      onOpenChange(false);
      window.location.assign(`/works/${to}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier l'édition</DialogTitle>
          <DialogDescription className="truncate">{edition.source_file}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="ed-title">Titre</Label>
            <Input
              id="ed-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-lang">Langue</Label>
            <Input
              id="ed-lang"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Droits</Label>
            <Select
              value={form.access}
              onValueChange={(v) => setForm({ ...form, access: v as typeof form.access })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restricted">restreint</SelectItem>
                <SelectItem value="excerpt">extraits</SelectItem>
                <SelectItem value="open">libre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-pub">Éditeur</Label>
            <Input
              id="ed-pub"
              value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-year">Année</Label>
            <Input
              id="ed-year"
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Traducteurs</Label>
            <PersonList
              value={translators}
              onChange={setTranslators}
              placeholder="Ajouter un traducteur"
            />
          </div>
          <Label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              checked={form.is_original}
              onCheckedChange={(v) => setForm({ ...form, is_original: v === true })}
            />
            Texte original
          </Label>
        </div>
        <div className="mt-2 rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Déplacer vers une autre œuvre</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Si le classement s'est trompé : l'édition change d'œuvre, et les deux œuvres sont
            réalignées.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <WorkPicker value={target} onChange={setTarget} exclude={workId} />
            </div>
            <Button
              variant="outline"
              disabled={!target || move.isPending}
              onClick={() => target && move.mutate(target.id)}
            >
              Déplacer
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
