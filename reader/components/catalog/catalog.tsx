"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/section";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkCard, WorkGrid } from "@/components/work-card";
import { api, unwrap } from "@/lib/api/client";
import type { LanguageCount, MovementNode, PersonSummary } from "@/lib/api/types";
import { languageName } from "@/lib/format";

const ERAS = [
  { value: "antiquity", label: "Antiquité", min: undefined, max: 500 },
  { value: "middle-ages", label: "Moyen Âge", min: 500, max: 1500 },
  { value: "16-17", label: "XVIᵉ–XVIIᵉ s.", min: 1500, max: 1700 },
  { value: "18", label: "XVIIIᵉ s.", min: 1700, max: 1800 },
  { value: "19", label: "XIXᵉ s.", min: 1800, max: 1900 },
  { value: "20", label: "XXᵉ s.", min: 1900, max: 2000 },
  { value: "21", label: "XXIᵉ s.", min: 2000, max: undefined },
] as const;

const SORTS = [
  { value: "title", label: "Titre (A → Z)" },
  { value: "-title", label: "Titre (Z → A)" },
  { value: "year", label: "Plus anciennes" },
  { value: "-year", label: "Plus récentes" },
  { value: "author", label: "Auteur" },
] as const;

type Sort = (typeof SORTS)[number]["value"];
const ALL = "__all";

function flatten(nodes: MovementNode[], depth = 0): { m: MovementNode; depth: number }[] {
  return nodes.flatMap((m) => [{ m, depth }, ...flatten(m.children, depth + 1)]);
}

/** Catalogue filtrable ; les filtres vivent dans l'URL (partageables, retour arrière). */
export function Catalog({
  movements,
  languages,
  authors,
}: {
  movements: MovementNode[];
  languages: LanguageCount[];
  authors: PersonSummary[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = {
    author_id: params.get("author") ?? undefined,
    movement_id: params.get("movement") ?? undefined,
    language: params.get("language") ?? undefined,
    era: params.get("era") ?? undefined,
    sort: (params.get("sort") as Sort | null) ?? "title",
  };
  const era = ERAS.find((e) => e.value === filters.era);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next}` as never, { scroll: false });
  };

  const query = useInfiniteQuery({
    queryKey: ["works", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET("/v1/works", {
          params: {
            query: {
              lang: "fr",
              author_id: filters.author_id,
              movement_id: filters.movement_id,
              language: filters.language,
              year_min: era?.min,
              year_max: era?.max,
              sort: filters.sort,
              limit: 30,
              cursor: pageParam,
            },
          },
          signal,
        }),
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    meta: { persist: true },
  });

  // Défilement infini : charge la page suivante quand la sentinelle apparaît
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const works = query.data?.pages.flatMap((p) => p.items) ?? [];
  const active = Boolean(
    filters.author_id || filters.movement_id || filters.language || filters.era,
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Auteur"
          value={filters.author_id}
          onChange={(v) => setParam("author", v)}
          options={authors.map((a) => ({ value: a.id, label: a.name }))}
        />
        <FilterSelect
          label="Courant"
          value={filters.movement_id}
          onChange={(v) => setParam("movement", v)}
          options={flatten(movements).map(({ m, depth }) => ({
            value: m.id,
            label: `${"  ".repeat(depth)}${m.label}`,
          }))}
        />
        <FilterSelect
          label="Langue"
          value={filters.language}
          onChange={(v) => setParam("language", v)}
          options={languages.map((l) => ({
            value: l.language,
            label: `${languageName(l.language)} (${l.n_works})`,
          }))}
        />
        <FilterSelect
          label="Époque"
          value={filters.era}
          onChange={(v) => setParam("era", v)}
          options={ERAS.map((e) => ({ value: e.value, label: e.label }))}
        />
        {active && (
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname as never)}>
            <X aria-hidden /> Effacer
          </Button>
        )}
        <div className="ml-auto">
          <Select
            value={filters.sort}
            onValueChange={(v) => setParam("sort", v === "title" ? undefined : v)}
          >
            <SelectTrigger size="sm" aria-label="Trier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isPending ? (
        <WorkGrid>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[2/3] w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </WorkGrid>
      ) : works.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="Aucune œuvre">
          {active
            ? "Aucune œuvre ne correspond à ces filtres."
            : "Le catalogue est vide pour l'instant."}
        </EmptyState>
      ) : (
        <WorkGrid>
          {works.map((w) => (
            <WorkCard
              key={w.id}
              work={w}
              footer={
                <div className="truncate text-[11px] text-muted-foreground">
                  {[w.first_published_year, w.languages.map((l) => l.toUpperCase()).join(" · ")]
                    .filter(Boolean)
                    .join(" — ")}
                </div>
              }
            />
          ))}
        </WorkGrid>
      )}
      <div ref={sentinel} className="flex h-16 items-center justify-center">
        {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        data-active={Boolean(value)}
        className="data-[active=true]:border-primary data-[active=true]:text-primary"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label} : tous</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="whitespace-pre">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
