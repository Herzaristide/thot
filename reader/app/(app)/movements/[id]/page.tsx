import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Section } from "@/components/section";
import { WorkCard, WorkGrid } from "@/components/work-card";
import { corpus } from "@/lib/api/server";

type Props = PageProps<"/movements/[id]">;

async function load(id: string) {
  const api = await corpus();
  const { data, response } = await api.GET("/v1/movements/{movement_id}", {
    params: { path: { movement_id: id }, query: { lang: "fr" } },
  });
  if (!data) {
    if (response.status === 404 || response.status === 422) notFound();
    throw new Error(`Corpus API : HTTP ${response.status}`);
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load((await params).id)).label };
}

export default async function MovementPage({ params }: Props) {
  const { id } = await params;
  const movement = await load(id);
  const api = await corpus();
  const works =
    (
      await api.GET("/v1/works", {
        params: { query: { movement_id: id, lang: "fr", sort: "year", limit: 100 } },
      })
    ).data?.items ?? [];
  const years =
    movement.start_year || movement.end_year
      ? `${movement.start_year ?? "?"}–${movement.end_year ?? ""}`
      : null;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-10">
        {movement.parent && (
          <Link
            href={`/movements/${movement.parent.id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {movement.parent.label} /
          </Link>
        )}
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {movement.label}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {[years, `${movement.n_works} œuvre${movement.n_works > 1 ? "s" : ""}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {movement.children.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {movement.children.map((c) => (
              <Link
                key={c.id}
                href={`/movements/${c.id}`}
                className="rounded-full border px-3 py-1 text-sm hover:bg-accent"
              >
                {c.label} <span className="text-muted-foreground tabular-nums">{c.n_works}</span>
              </Link>
            ))}
          </div>
        )}
      </header>
      {works.length > 0 ? (
        <Section title="Œuvres">
          <WorkGrid>
            {works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </WorkGrid>
        </Section>
      ) : (
        <EmptyState title="Aucune œuvre visible dans ce courant" />
      )}
    </div>
  );
}
