"use client";

import { BookMarked, BookOpen, CheckCheck, Heart } from "lucide-react";
import { ProgressCard } from "@/components/progress-card";
import { EmptyState } from "@/components/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkCard, WorkGrid } from "@/components/work-card";
import type { CachedWork, CollectionSummary, ProgressWithWork } from "@/lib/reader-data";
import { CollectionsList } from "./collections-list";

export function LibraryTabs({
  initialTab,
  reading,
  finished,
  favorites,
  collections,
}: {
  initialTab: string;
  reading: ProgressWithWork[];
  finished: ProgressWithWork[];
  favorites: { workId: string; work: CachedWork | null }[];
  collections: CollectionSummary[];
}) {
  return (
    <Tabs
      defaultValue={initialTab}
      onValueChange={(v) => {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", v);
        window.history.replaceState(null, "", url);
      }}
    >
      <TabsList className="mb-6">
        <TabsTrigger value="reading">
          En cours <Count n={reading.length} />
        </TabsTrigger>
        <TabsTrigger value="finished">
          Terminés <Count n={finished.length} />
        </TabsTrigger>
        <TabsTrigger value="favorites">
          Favoris <Count n={favorites.length} />
        </TabsTrigger>
        <TabsTrigger value="collections">
          Collections <Count n={collections.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reading">
        {reading.length === 0 ? (
          <EmptyState icon={<BookOpen />} title="Aucune lecture en cours">
            Ouvrez une œuvre depuis Explorer : votre place y sera gardée sur tous vos appareils.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reading.map((p) => (
              <ProgressCard key={p.editionId} p={p} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="finished">
        {finished.length === 0 ? (
          <EmptyState icon={<CheckCheck />} title="Aucun livre terminé pour l'instant" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {finished.map((p) => (
              <ProgressCard key={p.editionId} p={p} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="favorites">
        {favorites.length === 0 ? (
          <EmptyState icon={<Heart />} title="Aucun favori">
            Le cœur, sur la fiche d'une œuvre, l'ajoute ici.
          </EmptyState>
        ) : (
          <WorkGrid>
            {favorites.map((f) => f.work && <WorkCard key={f.workId} work={f.work} />)}
          </WorkGrid>
        )}
      </TabsContent>

      <TabsContent value="collections">
        {collections.length === 0 && (
          <div className="mb-6">
            <EmptyState icon={<BookMarked />} title="Aucune collection">
              Regroupez des œuvres par thème, par projet ou par envie.
            </EmptyState>
          </div>
        )}
        <CollectionsList collections={collections} />
      </TabsContent>
    </Tabs>
  );
}

function Count({ n }: { n: number }) {
  return n > 0 ? (
    <span className="ml-1 text-xs text-muted-foreground tabular-nums">{n}</span>
  ) : null;
}
