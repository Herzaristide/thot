import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/section";
import { WorkCard, WorkGrid } from "@/components/work-card";
import { corpus } from "@/lib/api/server";
import { languageName, lifespan } from "@/lib/format";

type Props = PageProps<"/authors/[id]">;

async function load(id: string) {
  const api = await corpus();
  const { data, response } = await api.GET("/v1/persons/{person_id}", {
    params: { path: { person_id: id }, query: { lang: "fr" } },
  });
  if (!data) {
    if (response.status === 404 || response.status === 422) notFound();
    throw new Error(`Corpus API : HTTP ${response.status}`);
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load((await params).id)).name };
}

export default async function AuthorPage({ params }: Props) {
  const { id } = await params;
  const person = await load(id);
  const api = await corpus();
  const works =
    person.n_works > 0
      ? ((
          await api.GET("/v1/works", {
            params: { query: { author_id: id, lang: "fr", sort: "year", limit: 100 } },
          })
        ).data?.items ?? [])
      : [];
  const otherNames = person.names.filter((n) => n.name !== person.name);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {person.name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {[
            lifespan(person.birth_year, person.death_year),
            person.n_works > 0 && `${person.n_works} œuvre${person.n_works > 1 ? "s" : ""}`,
            person.n_translations > 0 &&
              `${person.n_translations} traduction${person.n_translations > 1 ? "s" : ""}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {otherNames.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Aussi :{" "}
            {otherNames.map((n, i) => (
              <span key={`${n.language}-${n.name}`}>
                {i > 0 && ", "}
                <span lang={n.language}>{n.name}</span>
              </span>
            ))}
          </p>
        )}
      </header>

      {works.length > 0 && (
        <Section title="Œuvres">
          <WorkGrid>
            {works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </WorkGrid>
        </Section>
      )}

      {person.translations.length > 0 && (
        <Section title="Traductions">
          <ul className="divide-y rounded-xl border">
            {person.translations.map((t) => (
              <li key={t.edition_id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link href={`/works/${t.work.id}`} className="font-medium hover:underline">
                    {t.work.title}
                  </Link>
                  <div className="truncate text-sm text-muted-foreground" lang={t.language}>
                    {t.edition_title} · {languageName(t.language)}
                  </div>
                </div>
                <Link
                  href={`/read/${t.edition_id}`}
                  className="shrink-0 text-sm text-primary hover:underline"
                >
                  Lire
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
