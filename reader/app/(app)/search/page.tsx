import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/components/search/search-page";
import { PageTitle } from "@/components/section";
import { corpus } from "@/lib/api/server";

export const metadata: Metadata = { title: "Recherche" };

export default async function Page() {
  const api = await corpus();
  const languages = (await api.GET("/v1/languages")).data ?? [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Recherche"
        subtitle="Un thème, une citation, des mots : dans tout le corpus, en toutes langues."
      />
      <Suspense>
        <SearchPage languages={languages.map((l) => l.language)} />
      </Suspense>
    </div>
  );
}
