"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookPlus, Check, ExternalLink, Link2, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Confirm } from "@/components/common/misc";
import { PersonList, type PersonRef, WorkPicker, type WorkRef } from "@/components/common/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Identification, JobDetail, Resolution } from "@/lib/api/types";
import { languageName, percent, score } from "@/lib/format";
import { cn } from "@/lib/utils";

type Edition = NonNullable<Resolution["edition"]>;
type Choice = { kind: "attach"; work: WorkRef } | { kind: "create" };

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(value ?? 0) * 100}%` }}
        />
      </div>
      <span className="w-9 text-right tabular">{value === null ? "–" : score(value)}</span>
    </div>
  );
}

/** Ce que dit l'EPUB et ce que le classement en a déduit. */
function Evidence({ report }: { report: Identification }) {
  const md = report.metadata;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Ce que dit l'EPUB</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Titre</dt>
          <dd>{md.titles.join(" · ") || "–"}</dd>
          <dt className="text-muted-foreground">Créateurs</dt>
          <dd>
            {md.creators.map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ") || "–"}
          </dd>
          <dt className="text-muted-foreground">Langue</dt>
          <dd>
            {md.languages.join(", ") || "–"}
            {report.detected_language && (
              <span className="text-muted-foreground">
                {" "}
                · texte détecté : {languageName(report.detected_language)}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Éditeur</dt>
          <dd>
            {md.publisher ?? "–"}
            {md.date ? `, ${md.date}` : ""}
          </dd>
        </dl>
        <div className="mt-1 flex flex-col gap-1 border-t pt-2">
          {report.authors.map((a) => (
            <p key={a.name}>
              Auteur « {a.name} » →{" "}
              {a.person_id ? (
                <strong>{a.display_name}</strong>
              ) : (
                <span className="text-warn">inconnu en base</span>
              )}
              {a.wikidata_id && (
                <a
                  href={`https://www.wikidata.org/wiki/${a.wikidata_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground underline"
                >
                  {a.wikidata_id} <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </p>
          ))}
          {report.wikidata && (
            <p>
              Œuvre Wikidata{" "}
              <a
                href={`https://www.wikidata.org/wiki/${report.wikidata.id}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {report.wikidata.id}
              </a>
              {report.wikidata.year ? `, ${report.wikidata.year}` : ""}
              {report.wikidata.original_language
                ? `, en ${languageName(report.wikidata.original_language)}`
                : ""}
            </p>
          )}
          {report.wikidata_error && (
            <p className="text-xs text-muted-foreground">
              Wikidata non consulté : {report.wikidata_error}
            </p>
          )}
        </div>
        {report.warnings.map((w) => (
          <p key={w} className="flex items-start gap-1.5 text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function defaultEdition(report: Identification): Edition {
  return (
    report.proposal?.edition ?? {
      title: report.title,
      language: report.language ?? "",
      is_original: false,
      translators: report.translators,
      publisher: report.metadata.publisher,
      year: null,
      access: "restricted",
    }
  );
}

function initialChoice(report: Identification): Choice {
  const p = report.proposal;
  if (p?.action === "attach" && p.work_id) {
    const c = report.candidates.find((x) => x.work_id === p.work_id);
    return {
      kind: "attach",
      work: { id: p.work_id, title: c?.title ?? "œuvre proposée", authors: c?.authors },
    };
  }
  return { kind: "create" };
}

export function ReviewForm({ job }: { job: JobDetail }) {
  const report = (job.result as { identification?: Identification } | null)?.identification;
  const qc = useQueryClient();
  const [choice, setChoice] = useState<Choice>(() =>
    report ? initialChoice(report) : { kind: "create" },
  );
  const [edition, setEdition] = useState<Edition>(() =>
    report ? defaultEdition(report) : ({} as Edition),
  );
  const [replace, setReplace] = useState<string | null>(null);
  const proposedWork = report?.proposal?.action === "create_work" ? report.proposal.work : null;
  const [work, setWork] = useState({
    title: proposedWork?.title ?? report?.title ?? "",
    original_language: proposedWork?.original_language ?? "",
    first_published_year: proposedWork?.first_published_year
      ? String(proposedWork.first_published_year)
      : "",
    wikidata_id: proposedWork?.wikidata_id ?? report?.wikidata?.id ?? "",
  });
  const [authors, setAuthors] = useState<PersonRef[]>(() =>
    (
      proposedWork?.authors ??
      report?.authors.map((a) => (a.person_id ? { person_id: a.person_id } : { name: a.name })) ??
      ([] as { person_id?: string | null; name?: string | null; wikidata_id?: string | null }[])
    ).map((a: { person_id?: string | null; name?: string | null; wikidata_id?: string | null }) => {
      const known = report?.authors.find((x) => x.person_id && x.person_id === a.person_id);
      return {
        id: a.person_id ?? null,
        name: known?.display_name ?? a.name ?? "?",
        wikidata_id: a.wikidata_id ?? null,
      };
    }),
  );
  const [translators, setTranslators] = useState<string>(() =>
    (edition.translators ?? []).join(", "),
  );

  const resolve = useMutation({
    mutationFn: async (body: Resolution) =>
      unwrap(
        await api.POST("/v1/admin/jobs/{job_id}/resolve", {
          params: { path: { job_id: job.id } },
          body,
        }),
      ),
    onSuccess: (_, body) => {
      toast.success(
        body.action === "reject" ? "Dépôt rejeté" : "Validé : le worker reprend le traitement",
      );
      void qc.invalidateQueries({ queryKey: ["job", job.id] });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!report) return null;
  const candidate =
    choice.kind === "attach" ? report.candidates.find((c) => c.work_id === choice.work.id) : null;
  const sameLanguage =
    candidate?.editions.filter(
      (e) => e.language.split("-")[0] === (edition.language ?? "").split("-")[0],
    ) ?? [];

  const submit = () => {
    const ed: Edition = {
      ...edition,
      translators: translators
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      year: edition.year ? Number(edition.year) : null,
    };
    if (choice.kind === "attach") {
      resolve.mutate({
        action: "attach",
        work_id: choice.work.id,
        replace_edition_id: replace,
        edition: ed,
      });
    } else {
      resolve.mutate({
        action: "create_work",
        edition: ed,
        work: {
          title: work.title,
          original_language: work.original_language || null,
          first_published_year: work.first_published_year
            ? Number(work.first_published_year)
            : null,
          wikidata_id: work.wikidata_id || null,
          titles: ed.title && ed.language ? { [ed.language.split("-")[0]]: ed.title } : {},
          authors: authors.map((a) =>
            a.id ? { person_id: a.id } : { name: a.name, wikidata_id: a.wikidata_id ?? null },
          ),
        },
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Evidence report={report} />
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Classement</CardTitle>
          <span className="text-xs text-muted-foreground">
            proposition : {report.proposal?.action === "attach" ? "rattacher" : "nouvelle œuvre"}
            {report.confident ? " (indices concordants)" : ""}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Œuvre</legend>
            {report.candidates.slice(0, 4).map((c) => {
              const selected = choice.kind === "attach" && choice.work.id === c.work_id;
              return (
                <button
                  type="button"
                  key={c.work_id}
                  onClick={() => {
                    setChoice({
                      kind: "attach",
                      work: { id: c.work_id, title: c.title, authors: c.authors },
                    });
                    setReplace(null);
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
                    selected && "border-primary ring-1 ring-primary",
                  )}
                  aria-pressed={selected}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <Link2 className="mr-1 inline size-4 text-muted-foreground" aria-hidden />
                        {c.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.authors.join(", ")} ·{" "}
                        {c.editions.map((e) => e.language).join(", ") || "aucune édition"}
                      </p>
                    </div>
                    <span className="rounded bg-muted px-1.5 text-sm font-semibold tabular">
                      {percent(c.score)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    <ScoreLine label="auteur" value={c.author_score} />
                    <ScoreLine label="titre" value={c.title_score} />
                    <ScoreLine label="contenu" value={c.content_score} />
                  </div>
                  <ul className="mt-1.5 text-xs text-muted-foreground">
                    {c.reasons.map((r) => (
                      <li key={r}>· {r}</li>
                    ))}
                  </ul>
                  {c.duplicates.length > 0 && (
                    <p className="mt-1 text-xs text-warn">
                      Une édition existe déjà dans cette langue.
                    </p>
                  )}
                </button>
              );
            })}
            <div
              className={cn(
                "rounded-lg border p-3",
                choice.kind === "attach" && !candidate && "border-primary ring-1 ring-primary",
              )}
            >
              <p className="mb-2 text-xs text-muted-foreground">Autre œuvre de la base :</p>
              <WorkPicker
                value={choice.kind === "attach" && !candidate ? choice.work : null}
                onChange={(w) => w && setChoice({ kind: "attach", work: w })}
              />
            </div>
            <button
              type="button"
              onClick={() => setChoice({ kind: "create" })}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-3 text-left text-sm hover:bg-accent/50",
                choice.kind === "create" && "border-primary ring-1 ring-primary",
              )}
              aria-pressed={choice.kind === "create"}
            >
              <BookPlus className="size-4 text-muted-foreground" aria-hidden /> Créer une nouvelle
              œuvre
            </button>
          </fieldset>

          {choice.kind === "create" && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <Field label="Titre de l'œuvre (original)" className="sm:col-span-2">
                <Input
                  value={work.title}
                  onChange={(e) => setWork({ ...work, title: e.target.value })}
                />
              </Field>
              <Field label="Langue originale">
                <Input
                  value={work.original_language}
                  placeholder="ru, fr, de…"
                  onChange={(e) => setWork({ ...work, original_language: e.target.value })}
                />
              </Field>
              <Field label="Première publication">
                <Input
                  inputMode="numeric"
                  value={work.first_published_year}
                  onChange={(e) => setWork({ ...work, first_published_year: e.target.value })}
                />
              </Field>
              <Field label="Wikidata">
                <Input
                  value={work.wikidata_id}
                  placeholder="Q12345"
                  onChange={(e) => setWork({ ...work, wikidata_id: e.target.value })}
                />
              </Field>
              <Field label="Auteurs" className="sm:col-span-2">
                <PersonList value={authors} onChange={setAuthors} placeholder="Ajouter un auteur" />
              </Field>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titre de l'édition" className="sm:col-span-2">
              <Input
                value={edition.title ?? ""}
                onChange={(e) => setEdition({ ...edition, title: e.target.value })}
              />
            </Field>
            <Field label="Langue">
              <Input
                value={edition.language}
                onChange={(e) => setEdition({ ...edition, language: e.target.value })}
              />
            </Field>
            <Field label="Droits">
              <Select
                value={edition.access ?? "restricted"}
                onValueChange={(v) => setEdition({ ...edition, access: v as Edition["access"] })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">restreint (métadonnées seules)</SelectItem>
                  <SelectItem value="excerpt">extraits</SelectItem>
                  <SelectItem value="open">libre (texte intégral)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Traducteurs (séparés par des virgules)" className="sm:col-span-2">
              <Input value={translators} onChange={(e) => setTranslators(e.target.value)} />
            </Field>
            <Field label="Éditeur">
              <Input
                value={edition.publisher ?? ""}
                onChange={(e) => setEdition({ ...edition, publisher: e.target.value || null })}
              />
            </Field>
            <Field label="Année de l'édition">
              <Input
                inputMode="numeric"
                value={edition.year ?? ""}
                onChange={(e) =>
                  setEdition({ ...edition, year: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
            <Label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={!!edition.is_original}
                onCheckedChange={(v) => setEdition({ ...edition, is_original: v === true })}
              />
              Texte original (pas une traduction)
            </Label>
          </div>

          {sameLanguage.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
              <p className="mb-2 font-medium">Cette œuvre a déjà une édition dans cette langue :</p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="replace"
                  checked={replace === null}
                  onChange={() => setReplace(null)}
                />
                Ajouter comme nouvelle édition
              </label>
              {sameLanguage.map((e) => (
                <label key={e.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="replace"
                    checked={replace === e.id}
                    onChange={() => setReplace(e.id)}
                  />
                  Remplacer le texte de « {e.title} »
                  {e.translators.length ? ` (${e.translators.join(", ")})` : ""}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Confirm
              trigger={
                <Button variant="ghost" disabled={resolve.isPending}>
                  <X aria-hidden /> Rejeter le dépôt
                </Button>
              }
              title="Rejeter ce dépôt ?"
              description="Le fichier déposé est supprimé ; rien n'est ajouté au corpus."
              confirmLabel="Rejeter"
              destructive
              onConfirm={() => resolve.mutate({ action: "reject" })}
            />
            <Button
              onClick={submit}
              disabled={
                resolve.isPending ||
                !edition.language ||
                (choice.kind === "create" && (!work.title || !authors.length))
              }
            >
              {resolve.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {choice.kind === "attach"
                ? replace
                  ? "Remplacer le texte"
                  : `Rattacher à « ${choice.work.title} »`
                : "Créer l'œuvre et l'édition"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
