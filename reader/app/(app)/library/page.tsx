import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LibraryTabs } from "@/components/library/library-tabs";
import { PageTitle } from "@/components/section";
import { getUserSub } from "@/lib/auth";
import { listCollections, listFavorites, recentProgress } from "@/lib/reader-data";

export const metadata: Metadata = { title: "Bibliothèque" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const sub = await getUserSub();
  if (!sub) redirect("/login?next=/library");
  const { tab } = await searchParams;
  const [progress, favorites, collections] = await Promise.all([
    recentProgress(sub, 100),
    listFavorites(sub),
    listCollections(sub),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Bibliothèque" />
      <LibraryTabs
        initialTab={typeof tab === "string" ? tab : "reading"}
        reading={progress.filter((p) => !p.finishedAt)}
        finished={progress.filter((p) => p.finishedAt)}
        favorites={favorites}
        collections={collections}
      />
    </div>
  );
}
