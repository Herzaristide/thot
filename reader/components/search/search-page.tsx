"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/section";
import { SwitchField } from "@/components/switch-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, unwrap } from "@/lib/api/client";
import type { SearchHit, SearchRequest } from "@/lib/api/types";
import { languageName } from "@/lib/format";
import { usePreferences } from "@/lib/prefs/store";

type Mode = SearchRequest["mode"];

/** Résultat de /search ou de /similar (les deux contrats diffèrent sur le type des surlignages). */
type Hit = Omit<SearchHit, "passage"> & {
  passage: Omit<SearchHit["passage"], "highlights"> & { highlights: number[][] };
};

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: "theme",
    label: "Thème",
    hint: "Par le sens : décrivez une idée, une scène, un sentiment.",
  },
  {
    value: "quote",
    label: "Citation",
    hint: "Retrouvez un passage dont vous connaissez quelques mots, même traduits.",
  },
  { value: "words", label: "Mots", hint: "Les passages qui contiennent ces mots." },
];

function emptyFilters(): SearchRequest["filters"] {
  return {
    languages: [],
    original_only: false,
    year: null,
    author_ids: [],
    movement_ids: [],
    work_ids: [],
    edition_ids: [],
  };
}

/** Recherche de passages : l'état (requête, mode, langues) vit dans l'URL. */
export function SearchPage({ languages }: { languages: string[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { prefs } = usePreferences();

  const q = params.get("q") ?? "";
  const mode = (params.get("mode") as Mode | null) ?? "theme";
  const langs = params.getAll("lang");
  const originalOnly = params.get("original") === "1";
  const [draft, setDraft] = useState(q);

  const update = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      if (Array.isArray(v)) for (const x of v) next.append(k, x);
      else if (v) next.set(k, v);
    }
    router.replace(`${pathname}?${next}` as never, { scroll: false });
  };

  const request: SearchRequest = {
    q,
    mode,
    filters: { ...emptyFilters(), languages: langs, original_only: originalOnly },
    group_by: "work",
    show_languages: prefs.readingLangs,
    limit: 20,
  };

  const search = useQuery({
    queryKey: ["search", request],
    queryFn: async ({ signal }) => unwrap(await api.POST("/v1/search", { body: request, signal })),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

  const similar = useMutation({
    mutationFn: async (hit: Hit) =>
      unwrap(
        await api.POST("/v1/similar", {
          body: {
            edition_id: hit.edition.id,
            seq_start: hit.passage.seq_start,
            seq_end: hit.passage.seq_end,
            filters: emptyFilters(),
            group_by: "work",
            exclude_same_work: true,
            limit: 10,
          },
        }),
      ),
  });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          similar.reset();
          update({ q: draft.trim() || null });
        }}
        className="space-y-4"
      >
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mode === "theme"
                ? "un homme qui se demande s'il a le droit de tuer"
                : "Je suis un homme malade"
            }
            className="h-12 pr-28 pl-10 text-base"
            aria-label="Recherche"
            autoFocus={!q}
          />
          <Button
            type="submit"
            className="absolute top-1.5 right-1.5"
            disabled={draft.trim().length < 2}
          >
            Chercher
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => v && update({ mode: v === "theme" ? null : v })}
            aria-label="Mode de recherche"
          >
            {MODES.map((m) => (
              <ToggleGroupItem key={m.value} value={m.value} className="px-4">
                {m.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SwitchField
            reverse
            label="Originaux seulement"
            checked={originalOnly}
            onChange={(v) => update({ original: v ? "1" : null })}
          />
        </div>
        {languages.length > 1 && (
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={langs}
            onValueChange={(v) => update({ lang: v })}
            className="flex-wrap justify-start"
            aria-label="Langues"
          >
            {languages.map((l) => (
              <ToggleGroupItem key={l} value={l} className="px-3">
                {languageName(l)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <p className="text-sm text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
      </form>

      <div className="mt-8" aria-live="polite">
        {search.isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche…
          </div>
        )}
        {search.isError && (
          <p className="text-sm text-destructive">
            La recherche a échoué. Réessayez dans un instant.
          </p>
        )}
        {search.data && !search.isFetching && (
          <>
            <p className="mb-4 text-xs text-muted-foreground">
              {search.data.hits.length} passage{search.data.hits.length > 1 ? "s" : ""} ·{" "}
              {search.data.took_ms} ms
            </p>
            {search.data.hits.length === 0 ? (
              <EmptyState icon={<BookOpen />} title="Aucun passage trouvé">
                Essayez un autre mode, d'autres mots ou moins de filtres.
              </EmptyState>
            ) : (
              <ol className="space-y-4">
                {search.data.hits.map((h) => (
                  <li key={`${h.edition.id}-${h.passage.seq_start}`}>
                    <HitCard hit={h} onSimilar={() => similar.mutate(h)} />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        {(similar.isPending || similar.data) && (
          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-semibold">
              <Sparkles className="size-5 text-primary" aria-hidden /> Passages proches
            </h2>
            {similar.isPending ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <ol className="space-y-4">
                {similar.data?.hits.map((h) => (
                  <li key={`${h.edition.id}-${h.passage.seq_start}`}>
                    <HitCard hit={h} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: number[][] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [a = 0, b = 0] of [...ranges].sort((x, y) => (x[0] ?? 0) - (y[0] ?? 0))) {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="rounded-sm bg-highlight px-0.5 text-inherit">
        {text.slice(Math.max(a, at), b)}
      </mark>,
    );
    at = Math.max(at, b);
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function HitCard({ hit, onSimilar }: { hit: Hit; onSimilar?: () => void }) {
  const translations = Object.entries(hit.translations).filter(
    (e): e is [string, NonNullable<(typeof e)[1]>] =>
      e[1] !== null && e[1].edition_id !== hit.edition.id,
  );
  const readable = hit.edition.access !== "excerpt";
  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link href={`/works/${hit.work.id}`} className="font-serif font-semibold hover:underline">
          {hit.work.title}
        </Link>
        <span className="text-sm text-muted-foreground">
          {hit.work.authors.map((a) => a.name).join(", ")}
          {hit.work.first_published_year && ` · ${hit.work.first_published_year}`}
        </span>
        {hit.exact && <Badge className="ml-auto">Citation exacte</Badge>}
      </header>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{languageName(hit.edition.language)}</Badge>
        {hit.passage.section_path.length > 0 && <span>{hit.passage.section_path.join(" · ")}</span>}
        {hit.passage.page_label && <span>p. {hit.passage.page_label}</span>}
      </div>
      <blockquote
        className="font-serif leading-relaxed whitespace-pre-line"
        lang={hit.edition.language}
      >
        <Highlighted text={hit.passage.text} ranges={hit.passage.highlights} />
        {hit.passage.truncated && " […]"}
      </blockquote>
      {translations.map(([lang, t]) => (
        <blockquote
          key={lang}
          className="mt-3 border-l-2 pl-3 font-serif text-sm leading-relaxed text-muted-foreground"
          lang={t.language}
        >
          <span className="mb-1 block font-sans text-xs">{languageName(t.language)}</span>
          {t.text}
          {t.truncated && " […]"}
        </blockquote>
      ))}
      <footer className="mt-4 flex flex-wrap gap-2">
        {readable && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/read/${hit.edition.id}?seq=${hit.passage.seq_start}`}>
              <BookOpen aria-hidden /> Lire ici
            </Link>
          </Button>
        )}
        {onSimilar && (
          <Button size="sm" variant="ghost" onClick={onSimilar}>
            <Sparkles aria-hidden /> Plus comme ceci
          </Button>
        )}
      </footer>
    </article>
  );
}
