"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Info, Loader2, MoreHorizontal, Pencil, Scissors } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { SectionPatch, Structure, StructureSection } from "@/lib/api/types";
import { languageName, num } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = StructureSection["kind"];

const KINDS: [Kind, string][] = [
  ["volume", "volume"],
  ["part", "partie"],
  ["book", "livre"],
  ["chapter", "chapitre"],
  ["section", "section"],
  ["act", "acte"],
  ["scene", "scène"],
  ["poem", "poème"],
  ["canto", "chant"],
  ["story", "récit"],
  ["letter", "lettre"],
  ["essay", "essai"],
  ["dedication", "dédicace"],
  ["epigraph", "épigraphe"],
  ["preface", "préface"],
  ["foreword", "avant-propos"],
  ["introduction", "introduction"],
  ["prologue", "prologue"],
  ["epilogue", "épilogue"],
  ["afterword", "postface"],
  ["appendix", "annexe"],
  ["glossary", "glossaire"],
  ["notes", "notes"],
  ["note", "note"],
  ["other", "autre"],
];
const KIND_LABEL = Object.fromEntries(KINDS) as Record<Kind, string>;
const MATTER: Record<StructureSection["matter"], { label: string; className: string }> = {
  front: { label: "avant-texte", className: "bg-info/15 text-info" },
  body: { label: "corps", className: "bg-ok/15 text-ok" },
  back: { label: "après-texte", className: "bg-muted text-muted-foreground" },
};

function useStructureMutation(editionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      fn: () => Promise<{ data?: Structure; error?: unknown; response: Response }>,
    ) => unwrap(await fn()),
    onSuccess: (s) => {
      qc.setQueryData(["structure", editionId], s);
      toast.success("Structure modifiée : retraitement (découpage, index, alignement) en file");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function EditDialog({
  section,
  editionId,
  sections,
  onClose,
}: {
  section: StructureSection;
  editionId: string;
  sections: StructureSection[];
  onClose: () => void;
}) {
  const m = useStructureMutation(editionId);
  const [form, setForm] = useState({
    kind: section.kind,
    matter: section.matter,
    label: section.label ?? "",
    title: section.title ?? "",
    number: section.number === null ? "" : String(section.number),
    parent: section.parent_id ?? "root",
    descendants: true,
  });
  // Parents possibles : pas la section elle-même ni ses descendants (refusé par l'API de toute façon)
  const parents = sections.filter((s) => s.id !== section.id && s.kind !== "note");
  const submit = () => {
    const body: SectionPatch = {
      kind: form.kind,
      matter: form.matter,
      label: form.label || null,
      title: form.title || null,
      number: form.number === "" ? null : Number(form.number),
      apply_to_descendants: form.descendants,
      to_root: false,
    };
    if ((form.parent === "root" ? null : form.parent) !== section.parent_id) {
      if (form.parent === "root") body.to_root = true;
      else body.parent_id = form.parent;
    }
    m.mutate(
      () =>
        api.PATCH("/v1/admin/editions/{edition_id}/sections/{section_id}", {
          params: { path: { edition_id: editionId, section_id: section.id } },
          body,
        }),
      { onSuccess: onClose },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier la section</DialogTitle>
          <DialogDescription>
            segments {section.seq_start ?? "–"} à {section.seq_end ?? "–"} (
            {num(section.n_segments)})
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Partie du livre</Label>
            <Select
              value={form.matter}
              onValueChange={(v) => setForm({ ...form, matter: v as StructureSection["matter"] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="front">avant-texte (préface, dédicace…)</SelectItem>
                <SelectItem value="body">corps du texte</SelectItem>
                <SelectItem value="back">après-texte (notes, annexes…)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Label className="col-span-2 flex items-center gap-2 font-normal">
            <Checkbox
              checked={form.descendants}
              onCheckedChange={(v) => setForm({ ...form, descendants: v === true })}
            />
            Appliquer la partie du livre aux sous-sections
          </Label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-label">Libellé</Label>
            <Input
              id="s-label"
              placeholder="Chapitre III"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-number">Numéro</Label>
            <Input
              id="s-number"
              inputMode="numeric"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="s-title">Titre</Label>
            <Input
              id="s-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Rangée sous</Label>
            <Select value={form.parent} onValueChange={(v) => setForm({ ...form, parent: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="root">(racine du livre)</SelectItem>
                {parents.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {"  ".repeat(s.depth)}
                    {s.label || s.title || KIND_LABEL[s.kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={m.isPending}>
            {m.isPending && <Loader2 className="animate-spin" aria-hidden />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({
  section,
  editionId,
  onClose,
}: {
  section: StructureSection;
  editionId: string;
  onClose: () => void;
}) {
  const m = useStructureMutation(editionId);
  const [at, setAt] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const segments = useQuery({
    queryKey: ["structure", editionId, "segments", section.id],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/editions/{edition_id}/sections/{section_id}/segments", {
          params: { path: { edition_id: editionId, section_id: section.id } },
        }),
      ),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Scinder « {section.label || section.title || KIND_LABEL[section.kind]} »
          </DialogTitle>
          <DialogDescription>
            Choisissez le premier paragraphe de la nouvelle section (par exemple un chapitre que la
            table des matières a oublié).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto rounded-md border font-serif text-sm">
          {segments.isLoading && <Loading rows={4} />}
          {segments.data?.map((s, i) => (
            <button
              type="button"
              key={s.seq}
              disabled={i === 0}
              onClick={() => setAt(s.seq)}
              className={cn(
                "block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-accent/50 disabled:opacity-50",
                s.kind === "heading" && "font-semibold",
                at === s.seq && "bg-primary/10 ring-1 ring-primary ring-inset",
              )}
            >
              <span className="mr-2 font-sans text-xs text-muted-foreground tabular">{s.seq}</span>
              {s.text}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="split-title">Titre de la nouvelle section (facultatif)</Label>
          <Input id="split-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={at === null || m.isPending}
            onClick={() =>
              at !== null &&
              m.mutate(
                () =>
                  api.POST("/v1/admin/editions/{edition_id}/sections/{section_id}/split", {
                    params: { path: { edition_id: editionId, section_id: section.id } },
                    body: { at_seq: at, title: title || null },
                  }),
                { onSuccess: onClose },
              )
            }
          >
            <Scissors aria-hidden /> Scinder au segment {at ?? "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StructurePage({ id }: { id: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["structure", id],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/editions/{edition_id}/structure", {
          params: { path: { edition_id: id } },
        }),
      ),
  });
  const m = useStructureMutation(id);
  const [editing, setEditing] = useState<StructureSection | null>(null);
  const [splitting, setSplitting] = useState<StructureSection | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  if (isLoading) return <Loading rows={10} />;
  if (error || !data) return <ErrorBox error={error} />;
  const sections = data.sections.filter((s) => showNotes || s.kind !== "note");
  const nNotes = data.sections.filter((s) => s.kind === "note").length;
  const hasNextSibling = (s: StructureSection) =>
    data.sections.some((x) => x.parent_id === s.parent_id && x.seq > s.seq);

  return (
    <>
      <PageHeader
        eyebrow={<span>Structure · révision {data.revision}</span>}
        title={data.title}
        description={`${languageName(data.language)} · ${data.sections.length} sections. Le texte ne change pas : seuls le découpage et le rôle des sections sont modifiés.`}
      />
      {data.reprocess_pending && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info">
          <Info className="size-4" aria-hidden />
          Retraitement en file : redécoupage, réindexation et réalignement après vos modifications.{" "}
          <Link href="/jobs?kind=reprocess" className="underline">
            suivre
          </Link>
        </div>
      )}
      {nNotes > 0 && (
        <Label className="mb-3 flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={showNotes} onCheckedChange={(v) => setShowNotes(v === true)} />{" "}
          Afficher les {nNotes} notes
        </Label>
      )}
      <ol className="divide-y rounded-lg border">
        {sections.map((s) => (
          <li key={s.id} className="flex items-start gap-3 px-3 py-2 hover:bg-accent/30">
            <div className="min-w-0 flex-1" style={{ paddingLeft: `${s.depth * 1.25}rem` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{KIND_LABEL[s.kind]}</span>
                <span className={cn("rounded px-1.5 text-xs", MATTER[s.matter].className)}>
                  {MATTER[s.matter].label}
                </span>
                <span className="font-medium">
                  {[s.label, s.title].filter(Boolean).join(" — ") || (
                    <em className="text-muted-foreground">sans titre</em>
                  )}
                </span>
                {s.n_segments === 0 && s.kind !== "note" && (
                  <span className="text-xs text-warn">vide</span>
                )}
              </div>
              {s.preview && (
                <p className="mt-0.5 truncate font-serif text-sm text-muted-foreground">
                  {s.preview}
                </p>
              )}
            </div>
            <span className="hidden shrink-0 text-xs text-muted-foreground tabular sm:block">
              {s.seq_start !== null ? `${s.seq_start}–${s.seq_end}` : ""} · {num(s.n_segments)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Actions sur la section"
                  disabled={m.isPending}
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(s)}>
                  <Pencil aria-hidden /> Modifier…
                </DropdownMenuItem>
                <DropdownMenuItem disabled={s.own_segments < 2} onSelect={() => setSplitting(s)}>
                  <Scissors aria-hidden /> Scinder…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasNextSibling(s)}
                  onSelect={() =>
                    m.mutate(() =>
                      api.POST("/v1/admin/editions/{edition_id}/sections/{section_id}/merge-next", {
                        params: { path: { edition_id: id, section_id: s.id } },
                      }),
                    )
                  }
                >
                  <ArrowDownToLine aria-hidden /> Fusionner avec la suivante
                </DropdownMenuItem>
                {s.kind === "note" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Origine de la note</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(["author", "translator", "editor", "unknown"] as const).map((o) => (
                          <DropdownMenuItem
                            key={o}
                            onSelect={() =>
                              m.mutate(() =>
                                api.PATCH(
                                  "/v1/admin/editions/{edition_id}/notes/{note_section_id}",
                                  {
                                    params: {
                                      path: { edition_id: id, note_section_id: s.id },
                                      query: { origin: o },
                                    },
                                  },
                                ),
                              )
                            }
                          >
                            {
                              {
                                author: "auteur",
                                translator: "traducteur",
                                editor: "éditeur",
                                unknown: "inconnue",
                              }[o]
                            }
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ol>
      {editing && (
        <EditDialog
          section={editing}
          editionId={id}
          sections={data.sections}
          onClose={() => setEditing(null)}
        />
      )}
      {splitting && (
        <SplitDialog section={splitting} editionId={id} onClose={() => setSplitting(null)} />
      )}
    </>
  );
}
