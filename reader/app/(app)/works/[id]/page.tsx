import { BookOpen, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/covers/cover";
import { AddToCollection } from "@/components/library/add-to-collection";
import { FavoriteButton } from "@/components/library/favorite-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { corpus } from "@/lib/api/server";
import type { EditionSummary } from "@/lib/api/types";
import { getUserSub } from "@/lib/auth";
import { languageName, lifespan, percent } from "@/lib/format";
import { loadViewer } from "@/lib/me";
import { isFavorite, listCollections, progressFor } from "@/lib/reader-data";

type Props = PageProps<"/works/[id]">;

async function load(id: string) {
  const api = await corpus();
  const { data, response } = await api.GET("/v1/works/{work_id}", {
    params: { path: { work_id: id }, query: { lang: "fr" } },
  });
  if (!data) {
    if (response.status === 404 || response.status === 422) notFound();
    throw new Error(`Corpus API : HTTP ${response.status}`);
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const work = await load((await params).id);
  return {
    title: work.title,
    description: `${work.title} — ${work.authors.map((a) => a.name).join(", ")}`,
  };
}

const ALIGNMENT_LABEL = {
  reliable: "Alignement fiable",
  doubtful: "Alignement incertain",
  pending: "Alignement en attente",
  rejected: "Non alignée",
} as const;

export default async function WorkPage({ params }: Props) {
  const { id } = await params;
  const work = await load(id);
  const sub = await getUserSub();
  const { prefs } = await loadViewer();

  const [progress, favorite, collections] = sub
    ? await Promise.all([
        progressFor(
          sub,
          work.editions.map((e) => e.id),
        ),
        isFavorite(sub, work.id),
        listCollections(sub),
      ])
    : [[], false, []];

  const readable = (e: EditionSummary) => e.access !== "excerpt";
  const latest = [...progress].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const langs = prefs?.data.readingLangs ?? ["fr"];
  const preferred =
    (latest && work.editions.find((e) => e.id === latest.editionId)) ??
    langs.map((l) => work.editions.find((e) => e.language === l && readable(e))).find(Boolean) ??
    work.editions.find((e) => e.is_original && readable(e)) ??
    work.editions.find(readable);

  const progressByEdition = new Map(progress.map((p) => [p.editionId, p]));
  const editions = [...work.editions].sort(
    (a, b) => Number(b.is_original) - Number(a.is_original) || a.language.localeCompare(b.language),
  );

  return (
    <article className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <Cover work={work} size="lg" className="mx-auto w-44 shrink-0 shadow-lg sm:mx-0 sm:w-52" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {work.title}
          </h1>
          {work.original_title !== work.title && (
            <p
              className="mt-1 font-serif text-lg text-muted-foreground italic"
              lang={work.original_language ?? undefined}
            >
              {work.original_title}
            </p>
          )}
          <p className="mt-3 text-lg">
            {work.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link href={`/authors/${a.id}`} className="underline-offset-4 hover:underline">
                  {a.name}
                </Link>
                {(a.birth_year || a.death_year) && (
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    ({lifespan(a.birth_year, a.death_year)})
                  </span>
                )}
              </span>
            ))}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {work.first_published_year && (
              <div>
                <dt className="text-muted-foreground">Publication</dt>
                <dd>{work.first_published_year}</dd>
              </div>
            )}
            {work.original_language && (
              <div>
                <dt className="text-muted-foreground">Langue originale</dt>
                <dd>{languageName(work.original_language)}</dd>
              </div>
            )}
            {work.movements.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Courant</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {work.movements.map((m) => (
                    <Link key={m.id} href={`/movements/${m.id}`} className="hover:underline">
                      {m.label}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {preferred && readable(preferred) ? (
              <Button asChild size="lg">
                <Link href={`/read/${preferred.id}`}>
                  <BookOpen aria-hidden />
                  {progressByEdition.has(preferred.id) ? "Reprendre" : "Lire"}
                  <span className="opacity-75">· {languageName(preferred.language)}</span>
                </Link>
              </Button>
            ) : (
              <Button size="lg" disabled>
                <Lock aria-hidden /> Texte intégral indisponible
              </Button>
            )}
            {sub && (
              <>
                <FavoriteButton workId={work.id} initial={favorite} />
                <AddToCollection
                  workId={work.id}
                  collections={collections.map((c) => ({
                    id: c.id,
                    name: c.name,
                    emoji: c.emoji,
                    has: c.workIds.includes(work.id),
                  }))}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 font-serif text-xl font-semibold">Éditions et traductions</h2>
        <ul className="divide-y rounded-xl border">
          {editions.map((e) => {
            const p = progressByEdition.get(e.id);
            return (
              <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium" lang={e.language}>
                      {e.title}
                    </span>
                    <Badge variant="secondary">{languageName(e.language)}</Badge>
                    {e.is_original && <Badge variant="outline">Original</Badge>}
                    {e.access === "excerpt" && <Badge variant="outline">Extraits seulement</Badge>}
                    {e.access === "restricted" && <Badge variant="outline">Restreinte</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[
                      e.translators.length > 0 &&
                        `Trad. ${e.translators.map((t) => t.name).join(", ")}`,
                      e.publisher,
                      e.year,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {!e.is_original && e.alignment && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ALIGNMENT_LABEL[e.alignment.status]}
                      {e.alignment.aligned_ratio != null &&
                        ` · ${percent(e.alignment.aligned_ratio)} des paragraphes`}
                    </div>
                  )}
                </div>
                {p && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground sm:w-32">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: percent(p.progress) }} />
                    </div>
                    <span className="tabular-nums">{percent(p.progress)}</span>
                  </div>
                )}
                {readable(e) ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/read/${e.id}`}>{p ? "Reprendre" : "Lire"}</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Lock aria-hidden /> Sous droits
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
