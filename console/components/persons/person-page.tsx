"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitMerge, Loader2, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Confirm, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { PersonPicker, type PersonRef } from "@/components/common/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";
import type { AdminPerson } from "@/lib/api/types";
import { languageName, lifespan } from "@/lib/format";

function PersonForm({ person }: { person: AdminPerson }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    display_name: person.display_name,
    sort_name: person.sort_name ?? "",
    birth_year: person.birth_year ? String(person.birth_year) : "",
    death_year: person.death_year ? String(person.death_year) : "",
    wikidata_id: person.wikidata_id ?? "",
    names: person.names.map((n) => ({ ...n })),
  });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH("/v1/admin/persons/{person_id}", {
          params: {
            path: { person_id: person.id },
            header: { "if-match": `"${person.updated_at}"` },
          },
          body: {
            display_name: form.display_name,
            sort_name: form.sort_name || null,
            birth_year: form.birth_year ? Number(form.birth_year) : null,
            death_year: form.death_year ? Number(form.death_year) : null,
            wikidata_id: form.wikidata_id || null,
            names: form.names.filter((n) => n.language && n.name),
          },
        }),
      ),
    onSuccess: (p) => {
      qc.setQueryData(["person", person.id], p);
      toast.success("Personne enregistrée");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError && err.status === 412
          ? "Fiche modifiée entre-temps : rechargez."
          : errorMessage(err),
      ),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiche</CardTitle>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{" "}
          Enregistrer
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-name">Nom affiché</Label>
          <Input
            id="p-name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-sort">Nom de tri</Label>
          <Input
            id="p-sort"
            placeholder="Dostoïevski, Fiodor"
            value={form.sort_name}
            onChange={(e) => setForm({ ...form, sort_name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-birth">Naissance</Label>
            <Input
              id="p-birth"
              inputMode="numeric"
              value={form.birth_year}
              onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-death">Mort</Label>
            <Input
              id="p-death"
              inputMode="numeric"
              value={form.death_year}
              onChange={(e) => setForm({ ...form, death_year: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-wd">Wikidata</Label>
            <Input
              id="p-wd"
              value={form.wikidata_id}
              onChange={(e) => setForm({ ...form, wikidata_id: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Noms par langue ({form.names.length})</Label>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {form.names.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="w-20"
                  aria-label="Langue"
                  value={n.language}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      names: form.names.map((x, j) =>
                        j === i ? { ...x, language: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label="Nom"
                  value={n.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      names: form.names.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer"
                  onClick={() => setForm({ ...form, names: form.names.filter((_, j) => j !== i) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setForm({ ...form, names: [...form.names, { language: "", name: "" }] })}
          >
            <Plus aria-hidden /> Ajouter une variante
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PersonPage({ id }: { id: string }) {
  const [target, setTarget] = useState<PersonRef | null>(null);
  const {
    data: person,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["person", id],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/persons/{person_id}", { params: { path: { person_id: id } } }),
      ),
  });
  const merge = useMutation({
    mutationFn: async (into: string) =>
      unwrap(
        await api.POST("/v1/admin/persons/{person_id}/merge", {
          params: { path: { person_id: id } },
          body: { into },
        }),
      ),
    onSuccess: (p) => {
      toast.success("Personnes fusionnées");
      window.location.assign(`/persons/${p.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (isLoading) return <Loading />;
  if (error || !person) return <ErrorBox error={error} />;
  const works = person.works as { id: string; title: string; deleted: boolean }[];
  const translations = person.translations as {
    id: string;
    title: string;
    language: string;
    work_id: string;
  }[];
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/persons" className="hover:underline">
            Personnes
          </Link>
        }
        title={person.display_name}
        description={
          <>
            {lifespan(person.birth_year, person.death_year)}
            {person.wikidata_id && (
              <a
                href={`https://www.wikidata.org/wiki/${person.wikidata_id}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-1 underline"
              >
                {person.wikidata_id} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <PersonForm key={person.updated_at} person={person} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Œuvres ({works.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {works.map((w) => (
                <Link key={w.id} href={`/works/${w.id}`} className="hover:underline">
                  {w.title} {w.deleted && <span className="text-xs text-bad">(corbeille)</span>}
                </Link>
              ))}
              {!works.length && <span className="text-muted-foreground">Aucune.</span>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Traductions ({translations.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {translations.map((t) => (
                <Link key={t.id} href={`/works/${t.work_id}`} className="hover:underline">
                  {t.title}{" "}
                  <span className="text-xs text-muted-foreground">{languageName(t.language)}</span>
                </Link>
              ))}
              {!translations.length && <span className="text-muted-foreground">Aucune.</span>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Doublon ?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                Fusionner dans une autre personne : œuvres, traductions et noms passent à celle-ci,
                puis cette fiche disparaît.
              </p>
              <PersonPicker
                allowNew={false}
                placeholder={target ? target.name : "Choisir la personne qui reste"}
                onSelect={setTarget}
              />
              <Confirm
                trigger={
                  <Button variant="outline" size="sm" disabled={!target?.id || target.id === id}>
                    <GitMerge aria-hidden /> Fusionner dans {target?.name ?? "…"}
                  </Button>
                }
                title={`Fusionner « ${person.display_name} » dans « ${target?.name} » ?`}
                description="Irréversible : cette fiche est supprimée."
                confirmLabel="Fusionner"
                destructive
                onConfirm={() => target?.id && merge.mutate(target.id)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
