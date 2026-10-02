import type { Metadata } from "next";
import { Suspense } from "react";
import { Catalog } from "@/components/catalog/catalog";
import { PageTitle } from "@/components/section";
import { corpus } from "@/lib/api/server";

export const metadata: Metadata = { title: "Explorer" };

export default async function ExplorePage() {
  const api = await corpus();
  const [movements, languages, authors] = await Promise.all([
    api.GET("/v1/movements", { params: { query: { lang: "fr" } } }),
    api.GET("/v1/languages"),
    api.GET("/v1/persons", { params: { query: { role: "author", limit: 100, lang: "fr" } } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Explorer" subtitle="Le catalogue, par auteur, courant, langue ou époque." />
      <Suspense>
        <Catalog
          movements={movements.data ?? []}
          languages={languages.data ?? []}
          authors={authors.data?.items ?? []}
        />
      </Suspense>
    </div>
  );
}
